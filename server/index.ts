import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { WhatsAppManager } from './whatsapp';
import * as waTools from './whatsapp-tools';
import * as belgianTools from './belgian-tools';

const app = express();
const PORT = process.env.SANDBOX_PORT ? parseInt(process.env.SANDBOX_PORT) : 4200;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const waManager = new WhatsAppManager();
waManager.resumeExistingSessions();

// ── Serve built frontend (if dist/ exists) ──
const distPath = path.join(__dirname, '..', 'dist');
const distIndex = path.join(distPath, 'index.html');
app.use(express.static(distPath));

app.get('/', (_req, res) => {
  if (fs.existsSync(distIndex)) return res.sendFile(distIndex);
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
          params.mediaUrl, 
          params.mediaType, 
          params.caption
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
    const permissions = waManager.getEffectivePermissions(userId);
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

// ── Shutdown hook ──

process.on('SIGTERM', async () => {
  console.log('Shutting down WhatsApp clients...');
  await waManager.shutdown();
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
