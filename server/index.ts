import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { supabase } from './supabase';
import { WhatsAppManager } from './whatsapp';
import * as waTools from './whatsapp-tools';
import * as belgianTools from './belgian-tools';
import { GowaClient } from './gowa-client';

const app = express();
const PORT = process.env.SANDBOX_PORT ? parseInt(process.env.SANDBOX_PORT) : 4200;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// ── WhatsApp Provider: Gowa (preferred) or Baileys (fallback) ──
const useGowa = !!process.env.GOWA_API_URL;
let waManager: WhatsAppManager | null = null;
let gowaClient: GowaClient | null = null;

if (useGowa) {
  const gowaUrl = process.env.GOWA_API_URL!;
  const gowaAuth = (process.env.GOWA_API_AUTH || 'admin:120221').split(':');
  gowaClient = new GowaClient(gowaUrl, gowaAuth[0], gowaAuth[1]);
  console.log(`[Gowa] Using Go WhatsApp at ${gowaUrl}`);
} else {
  waManager = new WhatsAppManager();
  waManager.resumeExistingSessions();
}

// Server Housekeeping: Run every 30 minutes (Baileys only, gowa handles itself)
if (!useGowa) {
  setInterval(() => {
    try {
       console.log('[Housekeeping] Starting periodic cleanup...');
       for (const [userId, entry] of (waManager as any)['sessions'].entries()) {
          if ((entry.status === 'error' || entry.status === 'disconnected') && !entry.reconnecting) {
             console.log(`[Housekeeping] Evicting idle session: ${userId}`);
             (waManager as any)['sessions'].delete(userId);
          }
       }
    } catch (e) {
       console.error('[Housekeeping] Error:', e);
    }
  }, 30 * 60 * 1000);
}

// ── Root route: serve the frontend if dist/ exists, otherwise show a message ──
const distPath = path.join(__dirname, '..', 'dist');
const distIndex = path.join(distPath, 'index.html');

app.get('/', (_req, res) => {
  if (fs.existsSync(distIndex)) {
    res.sendFile(distIndex);
  } else {
    res.send('Beatrice Backend API Server is running. To open the application, visit http://localhost:3000');
  }
});

// Serve built frontend assets (JS, CSS, images)
app.use(express.static(distPath));

app.get('/api/health', async (_req, res) => {
  res.json({ status: 'ok', worker: 'client-side' });
});

app.post('/api/web/glance', async (req, res) => {
  try {
    const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    const maxResults = Math.max(1, Math.min(Number(req.body?.maxResults) || 3, 5));

    if (query.length < 2) {
      res.status(400).json({ error: 'query must be at least 2 characters' });
      return;
    }

    const url = new URL('https://api.duckduckgo.com/');
    url.searchParams.set('q', query.slice(0, 160));
    url.searchParams.set('format', 'json');
    url.searchParams.set('no_html', '1');
    url.searchParams.set('skip_disambig', '1');

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Beatrice Voice Assistant/1.0' },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      res.status(502).json({ error: `Web glance failed with status ${response.status}` });
      return;
    }

    const data: any = await response.json();
    const related: Array<{ title: string; url: string; snippet: string }> = [];
    const stripTags = (value: unknown) => String(value || '').replace(/<[^>]*>/g, '').trim();

    const collect = (item: any) => {
      if (Array.isArray(item?.Topics)) {
        item.Topics.forEach(collect);
        return;
      }

      const title = stripTags(item?.FirstURL ? item.Text?.split(' - ')[0] : item?.Text);
      const snippet = stripTags(item?.Text);
      const itemUrl = stripTags(item?.FirstURL);
      if (title && itemUrl) {
        related.push({ title, url: itemUrl, snippet });
      }
    };

    (Array.isArray(data.RelatedTopics) ? data.RelatedTopics : []).forEach(collect);

    res.json({
      query,
      heading: stripTags(data.Heading) || undefined,
      abstract: stripTags(data.AbstractText) || undefined,
      source: stripTags(data.AbstractSource || 'DuckDuckGo'),
      results: related.slice(0, maxResults),
    });
  } catch (err: any) {
    console.error('Web glance error:', err);
    res.status(500).json({ error: err.message || 'Web glance failed' });
  }
});

// ── Belgian Admin & Business Tools Route ──

app.post('/api/belgian/tool', async (req, res) => {
  try {
    const { tool } = req.body;
    const params = req.body.params || {};

    if (!tool) {
      res.status(400).json({ error: 'tool is required' });
      return;
    }

    let result: any;
    switch (tool) {
      case 'belgian_company_lookup':
        result = await belgianTools.lookupCompany(String(params.query || ''));
        break;
      case 'belgian_vies_vat_validate':
        result = await belgianTools.validateViesVat(String(params.vatNumber || ''));
        break;
      case 'belgian_peppol_invoice':
        result = await belgianTools.generatePeppolInvoice({
          recipientKbo: String(params.recipientKbo || ''),
          amount: Number(params.amount) || 0,
          description: String(params.description || ''),
          dueDate: params.dueDate ? String(params.dueDate) : undefined
        });
        break;
      case 'belgian_tax_calendar':
        result = await belgianTools.fetchTaxCalendar(params.period ? String(params.period) : undefined);
        break;
      case 'belgian_registration_tax_calc':
        result = await belgianTools.calculateRegistrationTax({
          purchasePrice: Number(params.purchasePrice) || 0,
          region: params.region || 'Flanders',
          isFirstTimeBuyer: !!params.isFirstTimeBuyer,
          energyRenovation: !!params.energyRenovation
        });
        break;
      case 'belgian_itsme_navigator':
        result = await belgianTools.getItsmeInstructions(String(params.administrativeTask || ''));
        break;
      case 'belgian_language_bridge':
        result = await belgianTools.runLanguageBridge(String(params.text || ''), params.targetLanguage || 'EN');
        break;
      case 'belgian_social_security_navigator':
        result = await belgianTools.navigateSocialSecurity(String(params.query || ''));
        break;
      case 'belgian_labor_law_simplifier':
        result = await belgianTools.simplifyLaborLaw({
          clauseType: String(params.clauseType || ''),
          contractType: params.contractType ? String(params.contractType) : undefined,
          durationMonths: params.durationMonths ? Number(params.durationMonths) : undefined,
          salary: params.salary ? Number(params.salary) : undefined
        });
        break;
      case 'belgian_mobility_planner':
        result = await belgianTools.getBelgianMobility(String(params.from || ''), String(params.to || ''), params.time ? String(params.time) : undefined);
        break;
      default:
        res.status(400).json({ error: `Unknown Belgian tool: ${tool}` });
        return;
    }
    res.json(result);
  } catch (err: any) {
    console.error('Belgian tool error:', err);
    res.status(500).json({ error: err.message || 'Belgian tool execution failed' });
  }
});

// ── Ollama Proxy Route ──
// Proxies generation requests to a local Ollama instance on the VPS.
// Set OLLAMA_BASE_URL to override (default: http://localhost:11434)
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

app.post('/api/ollama/generate', async (req, res) => {
  const { model, messages, options } = req.body;
  if (!model || !messages) {
    res.status(400).json({ error: 'model and messages are required' });
    return;
  }

  // Set SSE headers for streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const ollamaRes = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        options: options || {},
      }),
    });

    if (!ollamaRes.ok) {
      const errBody = await ollamaRes.text().catch(() => '');
      res.write(`data: ${JSON.stringify({ error: `Ollama error (${ollamaRes.status}): ${errBody}` })}\n\n`);
      res.end();
      return;
    }

    const reader = ollamaRes.body?.getReader();
    if (!reader) {
      res.write(`data: ${JSON.stringify({ error: 'No response body from Ollama' })}\n\n`);
      res.end();
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          if (json.done) {
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          } else if (json.message?.content) {
            res.write(`data: ${JSON.stringify({ text: json.message.content })}\n\n`);
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: any) {
    console.error('Ollama proxy error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message || 'Ollama proxy failed' })}\n\n`);
    res.end();
  }
});

// ── WhatsApp Routes ──
// Uses Gowa provider when GOWA_API_URL is set, otherwise falls back to Baileys

const getMsg = (e: any) => e?.message || String(e);

// Helper: route through active provider
function getApiUserId(userId: string) {
  return userId;
}

// ── Gowa Provider Routes ──
if (gowaClient) {

  app.post('/api/whatsapp/pair', async (req, res) => {
    try {
      const { userId, phoneNumber } = req.body;
      if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
      const result = await gowaClient!.startPairing(userId, phoneNumber);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: getMsg(err) });
    }
  });

  app.get('/api/whatsapp/status/:userId', async (req, res) => {
    try {
      const status = await gowaClient!.getFullStatus(req.params.userId);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: getMsg(err) });
    }
  });

  app.get('/api/whatsapp/qr/:userId', async (req, res) => {
    try {
      const status = await gowaClient!.getFullStatus(req.params.userId);
      if (!status.qrCode) {
        res.status(404).json({ error: 'QR not available', status: status.status });
        return;
      }
      const base64 = status.qrCode.replace(/^data:image\/png;base64,/, '');
      res.setHeader('Cache-Control', 'no-store');
      res.type('png').send(Buffer.from(base64, 'base64'));
    } catch (err: any) {
      res.status(500).json({ error: getMsg(err) });
    }
  });

  app.post('/api/whatsapp/disconnect', async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
      const deviceId = await gowaClient!.getDeviceIdForUser(userId);
      if (deviceId) {
        try { await gowaClient!.logout(deviceId); } catch { /* ignore gowa logout errors */ }
        gowaClient!.clearQrCache(deviceId);
      }
      gowaClient!.removeSession(userId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: getMsg(err) });
    }
  });

  app.post('/api/whatsapp/send', async (req, res) => {
    try {
      const { userId, to, text } = req.body;
      if (!userId || !to || !text) { res.status(400).json({ error: 'userId, to, text required' }); return; }
      const deviceId = await gowaClient!.getDeviceIdForUser(userId);
      if (!deviceId) { res.status(400).json({ error: 'WhatsApp not paired. Please pair first.' }); return; }
      const result = await gowaClient!.sendTextMessage(deviceId, to, text);
      res.json({ ok: true, result });
    } catch (err: any) {
      res.status(500).json({ error: getMsg(err) });
    }
  });

  app.post('/api/whatsapp/tool', async (req, res) => {
    try {
      const { userId, tool } = req.body;
      const params = req.body.params || {};
      if (!userId || !tool) { res.status(400).json({ error: 'userId and tool required' }); return; }
      // For gowa, delegate to the existing tool handler with gowa context
      // Tool execution still requires Baileys for now — or we proxy through gowa
      if (tool === 'sendMessage' || tool === 'sendGroupMessage') {
        const deviceId = await gowaClient!.getDeviceIdForUser(userId);
        if (!deviceId) { res.json({ ok: false, error: 'WhatsApp not paired.' }); return; }
        const to = params.to || params.jid || '';
        const text = params.text || '';
        if (!to || !text) { res.json({ ok: false, error: 'recipient and text required' }); return; }
        const result = await gowaClient!.sendTextMessage(deviceId, to, text);
        res.json({ ok: true, result });
      } else {
        // For read-only tools, try gowa first, fall back to Baileys if available
        if (waManager) {
          const result = await waTools.handleWhatsAppAction(waManager, userId, tool, params, req.body.permissions);
          res.json(result);
        } else {
          res.json({ ok: false, error: `Tool "${tool}" not available on gowa provider yet.` });
        }
      }
    } catch (err: any) {
      res.status(500).json({ error: getMsg(err) });
    }
  });

  // Gowa doesn't support these — return empty/disconnected
  app.get('/api/whatsapp/messages/:userId', (_req, res) => res.json({ messages: [] }));
  app.get('/api/whatsapp/webhook/:userId', (_req, res) => res.sendStatus(403));
  app.post('/api/whatsapp/webhook/:userId', (_req, res) => res.json({ ok: true }));

  console.log('[Gowa] All WhatsApp routes mounted for gowa provider');

  // Periodic QR cache cleanup (every 60s)
  setInterval(() => gowaClient!.pruneQrCache(), 60_000);

} else if (waManager) {

  // ── Baileys Provider Routes (fallback) ──

  app.post('/api/whatsapp/pair', async (req, res) => {
    try {
      const { userId, phoneNumber } = req.body;
      if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
      const result = await waManager!.startPairing(userId, phoneNumber);
      if ('error' in result) { res.status(500).json(result); return; }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: getMsg(err) });
    }
  });

  app.get('/api/whatsapp/status/:userId', async (req, res) => {
    try {
      const status = await waManager!.getStatusOrStart(req.params.userId);
      if (!status) { res.json({ status: 'not_found' }); return; }
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: getMsg(err) });
    }
  });

  app.get('/api/whatsapp/qr/:userId', async (req, res) => {
    try {
      const status = await waManager!.getStatusOrStart(req.params.userId);
      let qrCode = status?.qrCode;
      if (!qrCode) {
        const pollStart = Date.now();
        const pollTimeout = 30000;
        while (!qrCode && Date.now() - pollStart < pollTimeout) {
          await new Promise(resolve => setTimeout(resolve, 400));
          const refresh = waManager!.getStatus(req.params.userId);
          qrCode = refresh?.qrCode || undefined;
        }
      }
      if (!qrCode) {
        res.status(404).json({ error: 'QR not generated within 30s.', status: waManager!.getStatus(req.params.userId)?.status || 'unknown' });
        return;
      }
      const base64 = qrCode.replace(/^data:image\/png;base64,/, '');
      res.setHeader('Cache-Control', 'no-store');
      res.type('png').send(Buffer.from(base64, 'base64'));
    } catch (err: any) {
      res.status(500).json({ error: getMsg(err) });
    }
  });

  app.get('/api/whatsapp/messages/:userId', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 20;
    const messages = waManager!.getRecentMessages(req.params.userId, limit);
    res.json({ messages });
  });

  app.post('/api/whatsapp/disconnect', async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
      await waManager!.disconnect(userId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: getMsg(err) });
    }
  });

  app.post('/api/whatsapp/send', async (req, res) => {
    try {
      const { userId, to, text, permissions } = req.body;
      if (!userId || !to || !text) { res.status(400).json({ error: 'userId, to, text required' }); return; }
      const effectivePermissions = waManager!.getEffectivePermissions(userId, permissions);
      const result = await waTools.handleSendMessage(waManager!, userId, effectivePermissions, to, text);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: getMsg(err) });
    }
  });

  app.post('/api/whatsapp/tool', async (req, res) => {
    try {
      const { userId, tool, permissions } = req.body;
      const params = req.body.params || {};
      if (!userId || !tool) { res.status(400).json({ error: 'userId and tool required' }); return; }
      const result = await waTools.handleWhatsAppAction(waManager!, userId, tool, params, permissions);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: getMsg(err) });
    }
  });

  app.get('/api/whatsapp/webhook/:userId', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const expectedToken = process.env.WA_WEBHOOK_VERIFY_TOKEN || 'eburon_wa_verify';
    if (mode === 'subscribe' && token === expectedToken) {
      res.status(200).send(String(challenge || ''));
      return;
    }
    res.sendStatus(403);
  });

  app.post('/api/whatsapp/webhook/:userId', (req, res) => {
    try {
      res.json(waManager!.ingestCloudWebhook(req.params.userId, req.body));
    } catch (err: any) {
      res.status(500).json({ error: getMsg(err) });
    }
  });

}

// ── Web Architect (Website Builder) Routes ──

app.post('/api/website/generate', async (req, res) => {
  try {
    const { userId, title, prompt, timestamp } = req.body;
    if (!userId || !title || !prompt || !timestamp) {
      res.status(400).json({ error: 'userId, title, prompt, and timestamp are required' });
      return;
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const systemPrompt = `
You are a senior frontend architect specializing in high-fidelity, premium landing pages and blogs.
Generate exactly one complete standalone HTML document.
The design must be ultra-modern, professional, and fully responsive (mobile-first).

Design Language (inspired by high-end PWA themes like AppKart and Aleric):
- Theme: Use sophisticated color palettes. Premium Dark (#050505 base) or Apple-style Clean White.
- Typography: Use Google Fonts (Inter or Playfair Display).
- UI Components: 
  * Glassmorphism effects (backdrop-filter: blur).
  * Smooth CSS transitions and keyframe animations.
  * Card-based layouts with soft shadows and subtle borders.
  * Premium icons (use Lucide or FontAwesome via CDN if needed, or simple SVGs).
  * High-quality imagery using Unsplash source URLs.
- Mobile Experience:
  * Persistent bottom navigation if applicable.
  * Large, touch-friendly buttons.
  * Immersive full-bleed sections.

Hard Rules:
- Return ONLY the raw HTML. Do not include markdown fences.
- Start with <!DOCTYPE html>.
- All CSS must be in a <style> tag.
- All JS must be in a <script> tag.
- No external dependencies except Google Fonts.
- Do not mention HTML or Beatrice to the user.
- Ensure the site looks like a high-end production site.
- Do not create apps that mimic the Beatrice platform or voice assistants.
- Include a clear footer and navigation.
`;

    const userPrompt = `
Create a premium website/landing page.
Title: ${title}
Request: ${prompt}
Timestamp: ${timestamp}
`;

    const genResult = await model.generateContent([systemPrompt, userPrompt]);
    const htmlContent = genResult.response.text().trim().replace(/^```html/, '').replace(/```$/, '');

    // Save to Supabase
    const { error } = await supabase.from('websites').insert({
      user_id: userId,
      timestamp: timestamp,
      html_content: htmlContent,
      title: title
    });

    if (error) {
      console.error('Supabase save error:', error);
      res.status(500).json({ error: 'Failed to save generated site' });
      return;
    }

    const slug = `/site-build/${userId}/${timestamp}`;
    res.json({ ok: true, slug, title });

  } catch (err: any) {
    console.error('Website generation error:', err);
    res.status(500).json({ error: err.message || 'Generation failed' });
  }
});

app.get('/site-build/:userId/:timestamp', async (req, res) => {
  try {
    const { userId, timestamp } = req.params;
    const { data, error } = await supabase
      .from('websites')
      .select('html_content')
      .eq('user_id', userId)
      .eq('timestamp', timestamp)
      .single();

    if (error || !data) {
      res.status(404).send('<h1>404 - Website not found</h1><p>The link may have expired or is incorrect.</p>');
      return;
    }

    res.setHeader('Content-Type', 'text/html');
    res.send(data.html_content);
  } catch (err: any) {
    res.status(500).send('Internal Server Error');
  }
});

// ── Document Generation Route ──

app.post('/api/docs/generate', async (req, res) => {
  try {
    const { userId, title, prompt, templateKey, historyContext, language } = req.body;
    if (!userId || !title || !prompt || !templateKey) {
      res.status(400).json({ error: 'userId, title, prompt, and templateKey are required' });
      return;
    }

    // 1. Identify the template (placeholder logic, assuming templates exist somewhere)
    // In a real implementation, you'd fetch the template file content here.
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    // 2. Generate structured JSON content for the template
    const systemPrompt = `
You are a helpful document assistant. Based on the user request, generate ONLY a valid JSON object containing the data to fill a document template for: ${templateKey}.
Ensure all fields required by the template are populated with appropriate values derived from the user request and conversation.
`;

    const userPrompt = `
Title: ${title}
Request: ${prompt}
Context: ${historyContext || ''}
Language: ${language || 'en'}
`;

    const genResult = await model.generateContent([systemPrompt, userPrompt]);
    const jsonContent = JSON.parse(genResult.response.text().trim().replace(/^```json/, '').replace(/```$/, ''));

    // 3. Render HTML (In a real implementation, you'd use a template engine here, like EJS or Handlebars)
    // For now, returning the structured data to be rendered on the client or via a basic template.
    
    // Placeholder rendering logic
    const htmlContent = `<h1>${jsonContent.title || title}</h1><p>${JSON.stringify(jsonContent)}</p>`;

    // Save to Supabase (assuming a 'documents' table exists)
    const { error } = await supabase.from('tool_outputs').insert({
      user_id: userId,
      type: 'document',
      content: { htmlContent, data: jsonContent },
      metadata: { title, templateKey }
    });

    if (error) {
      console.error('Supabase save error:', error);
      res.status(500).json({ error: 'Failed to save generated document' });
      return;
    }

    res.json({ ok: true, data: jsonContent });

  } catch (err: any) {
    console.error('Document generation error:', err);
    res.status(500).json({ error: err.message || 'Generation failed' });
  }
});

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  if (waManager) await waManager!.shutdown();
  process.exit(0);
});

// ── SPA fallback — any non-API, non-asset route serves index.html ──
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/site-build/')) return next();
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) next();
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Beatrice Backend Server running on http://0.0.0.0:${PORT}`);
});
