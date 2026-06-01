import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from './supabase';
import { WhatsAppManager } from './whatsapp';
import * as waTools from './whatsapp-tools';
import * as belgianTools from './belgian-tools';

const app = express();
const PORT = process.env.SANDBOX_PORT ? parseInt(process.env.SANDBOX_PORT) : 4200;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const waManager = new WhatsAppManager();
waManager.resumeExistingSessions();

app.get('/', (_req, res) => {
  res.send('Beatrice Backend API Server is running. To open the application, visit http://localhost:3000');
});

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

// ── WhatsApp Routes ──

app.post('/api/whatsapp/pair', async (req, res) => {
  try {
    const { userId, phoneNumber } = req.body;
    if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
    const result = await waManager.startPairing(userId, phoneNumber);
    if ('error' in result) { res.status(500).json(result); return; }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Pairing failed' });
  }
});

app.get('/api/whatsapp/status/:userId', async (req, res) => {
  try {
    const status = await waManager.getStatusOrStart(req.params.userId);
    if (!status) { res.json({ status: 'not_found' }); return; }
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to read WhatsApp status' });
  }
});

app.get('/api/whatsapp/qr/:userId', async (req, res) => {
  try {
    const status = await waManager.getStatusOrStart(req.params.userId);
    const qrCode = status?.qrCode;
    if (!qrCode) {
      res.status(404).send('QR not available');
      return;
    }

    const base64 = qrCode.replace(/^data:image\/png;base64,/, '');
    res.setHeader('Cache-Control', 'no-store');
    res.type('png').send(Buffer.from(base64, 'base64'));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to read WhatsApp QR' });
  }
});

app.get('/api/whatsapp/messages/:userId', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const messages = waManager.getRecentMessages(req.params.userId, limit);
  res.json({ messages });
});

app.post('/api/whatsapp/disconnect', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
    await waManager.disconnect(userId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const { userId, to, text, permissions } = req.body;
    if (!userId || !to || !text) { res.status(400).json({ error: 'userId, to, text required' }); return; }
    const effectivePermissions = waManager.getEffectivePermissions(userId, permissions);
    const result = await waTools.handleSendMessage(waManager, userId, effectivePermissions, to, text);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/whatsapp/tool', async (req, res) => {
  try {
    const { userId, tool, permissions } = req.body;
    const params = req.body.params || {};
    if (!userId || !tool) { res.status(400).json({ error: 'userId and tool required' }); return; }
    const effectivePermissions = waManager.getEffectivePermissions(userId, permissions);

    let result: any;
    switch (tool) {
      case 'sendMessage':
        result = await waTools.handleSendMessage(
          waManager, 
          userId, 
          effectivePermissions, 
          params.to, 
          params.text, 
          params.mediaUrl || params.url, 
          params.mediaType || params.type, 
          params.caption
        );
        break;
      case 'sendMedia':
        result = await waTools.handleSendMedia(
          waManager,
          userId,
          effectivePermissions,
          params.to || params.chatId,
          params.url || params.mediaUrl,
          params.type || params.mediaType || 'image',
          params.caption
        );
        break;
      case 'sendAudio':
        result = await waTools.handleSendAudio(
          waManager,
          userId,
          effectivePermissions,
          params.to || params.chatId,
          params.url || params.mediaUrl,
          params.ptt
        );
        break;
      case 'sendReaction':
        result = await waTools.handleSendReaction(
          waManager,
          userId,
          effectivePermissions,
          params.chatId || params.to,
          params.messageId,
          params.emoji
        );
        break;
      case 'sendButtons':
        result = await waTools.handleSendButtons(
          waManager,
          userId,
          effectivePermissions,
          params.to || params.chatId,
          params.text,
          Array.isArray(params.buttons) ? params.buttons : [],
          params.footer
        );
        break;
      case 'readChats':
        result = await waTools.handleReadChats(waManager, userId, effectivePermissions, params.limit);
        break;
      case 'getContacts':
        result = await waTools.handleGetContacts(waManager, userId, effectivePermissions);
        break;
      case 'addContact':
        result = await waTools.handleAddContact(waManager, userId, effectivePermissions, params.name, params.number || params.to);
        break;
      case 'getGroups':
        result = await waTools.handleGetGroups(waManager, userId, effectivePermissions);
        break;
      case 'sendGroupMessage':
        result = await waTools.handleSendGroupMessage(waManager, userId, effectivePermissions, params.groupId || params.chatId || params.groupName, params.text);
        break;
      case 'readGroupChat':
        result = await waTools.handleReadGroupChat(waManager, userId, effectivePermissions, params.groupId || params.chatId || params.groupName, params.limit);
        break;
      case 'getMessageHistory':
        result = await waTools.handleGetMessageHistory(waManager, userId, effectivePermissions, params.chatId || params.contactId || params.to || params.name, params.limit);
        break;
      case 'getCalls':
        result = await waTools.handleGetCalls(waManager, userId, effectivePermissions, params.limit);
        break;
      default:
        res.status(400).json({ error: `Unknown tool: ${tool}` });
        return;
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/whatsapp/admin/overview/:userId', async (req, res) => {
  try {
    res.json(await waManager.getAdminOverview(req.params.userId));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load WhatsApp admin overview' });
  }
});

app.get('/api/whatsapp/admin/config/:userId', (req, res) => {
  try {
    res.json({ config: waManager.getAdminConfigPublic(req.params.userId) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load WhatsApp admin config' });
  }
});

app.post('/api/whatsapp/admin/config', (req, res) => {
  try {
    const { userId, config } = req.body;
    if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
    res.json({ config: waManager.saveAdminConfig(userId, config || {}) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save WhatsApp admin config' });
  }
});

app.post('/api/whatsapp/admin/test-message', async (req, res) => {
  try {
    const { userId, to, text } = req.body;
    if (!userId || !to || !text) { res.status(400).json({ error: 'userId, to, text required' }); return; }
    const permissions = waManager.getEffectivePermissions(userId, {
      requireUserApproval: true,
      approvedByUser: true,
      mode: 'delegated_send',
    });
    const result = await waTools.handleSendMessage(waManager, userId, permissions, to, text);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to send test message' });
  }
});

app.get('/api/whatsapp/webhook/:userId', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && waManager.verifyWebhookToken(req.params.userId, token)) {
    res.status(200).send(String(challenge || ''));
    return;
  }
  res.sendStatus(403);
});

app.post('/api/whatsapp/webhook/:userId', (req, res) => {
  try {
    res.json(waManager.ingestCloudWebhook(req.params.userId, req.body));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Webhook ingest failed' });
  }
});

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

// ── Shutdown hook ──

process.on('SIGTERM', async () => {
  console.log('Shutting down WhatsApp clients...');
  await waManager.shutdown();
  process.exit(0);
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Beatrice Backend Server running on http://0.0.0.0:${PORT}`);
});
