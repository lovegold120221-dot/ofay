import { Boom } from '@hapi/boom';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import P from 'pino';
import QRCode from 'qrcode';

type WaStatus = 'init' | 'qr_ready' | 'paired' | 'disconnected' | 'error';
type WaProvider = 'linked_device' | 'cloud_api';

const WA_PERMISSION_KEYS = [
  'send_messages',
  'read_chats',
  'access_contacts',
  'manage_contacts',
  'access_groups',
  'send_group_messages',
  'read_group_chats',
  'view_message_history',
] as const;

type WaPermission = typeof WA_PERMISSION_KEYS[number];

export interface WaRecentMessage {
  id: string;
  chatId: string;
  from: string;
  body: string;
  timestamp: number;
  fromMe: boolean;
  isGroup: boolean;
  isMedia: boolean;
}

export interface WaCallRecord {
  id: string;
  chatId: string;
  from: string;
  timestamp: number;
  status: string;
  isVideo: boolean;
  fromMe: boolean;
}

export interface WaChatSummary {
  id: string;
  name: string;
  unreadCount: number;
  lastMessage: string;
  timestamp: number;
  isGroup: boolean;
}

export interface WaContactSummary {
  id: string;
  name: string;
  notify?: string;
  verifiedName?: string;
  number: string;
}

interface WaSession {
  userId: string;
  status: WaStatus;
  qrCode: string | null;
  qrRaw: string | null;
  pairingCode?: string | null;
  phone: string | null;
  sock: any | null;
  authDir: string;
  dataFile: string;
  error: string | null;
  recentMessages: WaRecentMessage[];
  calls: WaCallRecord[];
  contacts: Record<string, WaContactSummary>;
  messageById: Map<string, any>;
  reconnecting: boolean;
  saveTimer: NodeJS.Timeout | null;
  reconnectTimer?: NodeJS.Timeout | null;
}

const logger = P({ level: process.env.WA_LOG_LEVEL || 'silent' });
const MESSAGE_HISTORY_LIMIT = Math.max(250, Math.min(Number(process.env.WA_HISTORY_LIMIT) || 50_000, 250_000));
const HISTORY_RESPONSE_LIMIT = Math.max(50, Math.min(Number(process.env.WA_HISTORY_RESPONSE_LIMIT) || 2_000, MESSAGE_HISTORY_LIMIT));
const SYNC_FULL_HISTORY = process.env.WA_SYNC_FULL_HISTORY !== 'false';

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeUserId(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function defaultPermissions(): Record<WaPermission, boolean> {
  return WA_PERMISSION_KEYS.reduce((acc, key) => {
    acc[key] = true; // All users get full CRUD access by default
    return acc;
  }, {} as Record<WaPermission, boolean>);
}

function normalizePermissions(input?: Partial<Record<WaPermission, boolean>>): Record<WaPermission, boolean> {
  const base = defaultPermissions();
  for (const key of WA_PERMISSION_KEYS) {
    if (typeof input?.[key] === 'boolean') base[key] = input[key] === true;
  }
  return base;
}

function cleanPhoneNumber(input: string, defaultCountryCode = ''): string {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (raw.startsWith('+') || !defaultCountryCode) return digits;
  if (digits.startsWith(defaultCountryCode)) return digits;
  return `${defaultCountryCode}${digits.replace(/^0+/, '')}`;
}

function messageText(message: any): string {
  const m = message?.message;
  if (!m) return '';
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    ''
  );
}

function timestampMs(value: any): number {
  if (!value) return Date.now();
  if (typeof value === 'number') return value > 10_000_000_000 ? value : value * 1000;
  if (typeof value?.toNumber === 'function') return value.toNumber() * 1000;
  if (value instanceof Date) return value.getTime();
  return Date.now();
}

export function toWhatsAppJid(value: string, group = false): string {
  const input = String(value || '').trim();
  if (!input) return '';
  if (input.includes('@s.whatsapp.net') || input.includes('@g.us') || input.includes('@broadcast')) {
    return input;
  }
  const cleaned = input.replace(/\D/g, '');
  if (!cleaned) return input;
  return `${cleaned}@${group ? 'g.us' : 's.whatsapp.net'}`;
}

function jidNumber(jid: string): string {
  return jid.split('@')[0] || jid;
}

function readSessionData(dataFile: string): Pick<WaSession, 'recentMessages' | 'calls' | 'contacts'> {
  try {
    if (!fs.existsSync(dataFile)) return { recentMessages: [], calls: [], contacts: {} };
    const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    return {
      recentMessages: Array.isArray(parsed.recentMessages) ? parsed.recentMessages : [],
      calls: Array.isArray(parsed.calls) ? parsed.calls : [],
      contacts: parsed.contacts && typeof parsed.contacts === 'object' ? parsed.contacts : {},
    };
  } catch {
    return { recentMessages: [], calls: [], contacts: {} };
  }
}

function writeSessionData(entry: WaSession) {
  const payload = {
    recentMessages: entry.recentMessages.slice(0, MESSAGE_HISTORY_LIMIT),
    calls: entry.calls.slice(0, 100),
    contacts: entry.contacts,
  };
  fs.writeFileSync(entry.dataFile, JSON.stringify(payload, null, 2));
}

function storeMessage(entry: WaSession, msg: any): WaRecentMessage | null {
  const chatId = msg.key?.remoteJid || '';
  if (!chatId || chatId === 'status@broadcast') return null;

  const id = msg.key?.id || `${chatId}:${Date.now()}`;
  if (msg.key?.id) entry.messageById.set(`${chatId}:${msg.key.id}`, msg);

  const body = messageText(msg) || '[media]';
  const record: WaRecentMessage = {
    id,
    chatId,
    from: msg.key?.participant || msg.key?.remoteJid || '',
    body: body.slice(0, 1000),
    timestamp: timestampMs(msg.messageTimestamp),
    fromMe: !!msg.key?.fromMe,
    isGroup: chatId.endsWith('@g.us'),
    isMedia: !!msg.message?.imageMessage || !!msg.message?.videoMessage || !!msg.message?.documentMessage || !!msg.message?.audioMessage,
  };

  const existingIndex = entry.recentMessages.findIndex(message => message.id === record.id && message.chatId === record.chatId);
  if (existingIndex >= 0) entry.recentMessages.splice(existingIndex, 1);

  entry.recentMessages.unshift(record);
  if (entry.recentMessages.length > MESSAGE_HISTORY_LIMIT) {
    entry.recentMessages.length = MESSAGE_HISTORY_LIMIT;
  }

  return record;
}

export class WhatsAppManager {
  private sessions = new Map<string, WaSession>();
  private authRoot = process.env.WA_AUTH_ROOT || path.join(process.cwd(), '.baileys_auth');

  async resumeExistingSessions(): Promise<void> {
    if (!fs.existsSync(this.authRoot)) return;
    try {
      const dirs = fs.readdirSync(this.authRoot);
      for (const dir of dirs) {
        const fullPath = path.join(this.authRoot, dir);
        if (fs.statSync(fullPath).isDirectory()) {
          const credsFile = path.join(fullPath, 'creds.json');
          if (fs.existsSync(credsFile)) {
            console.log(`Resuming WhatsApp session: ${dir}`);
            this.startSession(dir).catch((err: any) => {
              console.error(`Failed to auto-resume session ${dir}:`, err.message);
            });
          }
        }
      }
    } catch (error) {
      console.error('Error resuming existing WhatsApp sessions:', error);
    }
  }

  async startPairing(userId: string, phoneNumber?: string): Promise<{ pairingCode?: string; status: string }> {
    const existing = this.sessions.get(userId);
    
    // If we have an existing session and no new phone number is provided, return current
    if (existing && !phoneNumber && ['init', 'qr_ready', 'paired'].includes(existing.status)) {
      return { pairingCode: existing.pairingCode || undefined, status: existing.status };
    }

    if (existing) {
       // Clear old pairing data to ensure UI reflects the new request
       existing.pairingCode = null;
       existing.qrCode = null;
       existing.qrRaw = null;
       if (phoneNumber) await this.disconnect(userId);
    }

    await this.startSession(userId, phoneNumber);
    const entry = this.sessions.get(userId);
    return { pairingCode: entry?.pairingCode || undefined, status: entry?.status || 'init' };
  }

  private async reconnect(userId: string, attempt = 0) {
    const entry = this.sessions.get(userId);
    if (!entry) return; // User has disconnected/removed the session

    // If it's already logged out, do not reconnect
    if (entry.status === 'disconnected') return;

    entry.reconnecting = true;
    
    // Calculate backoff delay: 2s, 5s, 10s, 30s, up to 60s max
    const delays = [2000, 5000, 10000, 30000, 60000];
    const delay = delays[Math.min(attempt, delays.length - 1)];

    console.log(`[WhatsApp] Scheduling reconnection for ${userId} in ${delay}ms (attempt ${attempt + 1})`);

    this.clearReconnectTimer(entry);

    entry.reconnectTimer = setTimeout(async () => {
      // Check again if the session is still active and unchanged
      const currentEntry = this.sessions.get(userId);
      if (currentEntry !== entry) return;

      try {
        console.log(`[WhatsApp] Attempting to reconnect session for ${userId}...`);
        await this.startSession(userId);
      } catch (error: any) {
        console.error(`[WhatsApp] Reconnection attempt ${attempt + 1} failed for ${userId}:`, error.message);
        
        // Update status and error in the active session
        const activeEntry = this.sessions.get(userId);
        if (activeEntry === entry) {
          activeEntry.status = 'error';
          activeEntry.error = error.message || 'Reconnect failed';
          // Trigger the next retry
          this.reconnect(userId, attempt + 1);
        }
      }
    }, delay);
  }

  private latestVersion: [number, number, number] | null = null;
  private versionFetchTime = 0;

  private async getBaileysVersion(): Promise<[number, number, number]> {
    const now = Date.now();
    // Cache version for 6 hours
    if (this.latestVersion && (now - this.versionFetchTime < 6 * 3600 * 1000)) {
      return this.latestVersion;
    }
    try {
      const { version } = await fetchLatestBaileysVersion();
      this.latestVersion = version;
      this.versionFetchTime = now;
      return version;
    } catch (err) {
      console.warn('[WhatsApp] Failed to fetch latest Baileys version, using default.');
      return this.latestVersion || [2, 3000, 0];
    }
  }

  async startSession(userId: string, phoneNumber?: string): Promise<void> {
    const safeId = safeUserId(userId);
    const authDir = path.join(this.authRoot, safeId);
    const dataFile = path.join(authDir, 'session-data.json');
    ensureDir(authDir);

    let entry = this.sessions.get(userId);
    if (entry) {
      console.log(`[WhatsApp] Re-initializing session for ${userId}`);
      this.clearSaveTimer(entry);
      this.clearReconnectTimer(entry);
      try {
        // Detach all listeners from old socket before closing
        entry.sock?.ev.removeAllListeners('connection.update');
        entry.sock?.ev.removeAllListeners('creds.update');
        entry.sock?.ev.removeAllListeners('messages.upsert');
        entry.sock?.end(undefined);
      } catch (e) {
        console.warn(`[WhatsApp] Error closing old socket for ${userId}:`, e);
      }
      
      entry.status = 'init';
      entry.sock = null;
      entry.error = null;
      entry.pairingCode = null;
      // Clear heavy in-memory caches to prevent memory bloat
      entry.messageById.clear();
    } else {
      const savedData = readSessionData(dataFile);
      entry = {
        userId,
        status: 'init',
        qrCode: null,
        qrRaw: null,
        pairingCode: null,
        phone: null,
        sock: null,
        authDir,
        dataFile,
        error: null,
        recentMessages: savedData.recentMessages,
        calls: savedData.calls,
        contacts: savedData.contacts,
        messageById: new Map(),
        reconnecting: false,
        saveTimer: null,
        reconnectTimer: null,
      };
      this.sessions.set(userId, entry);
    }

    try {
      const { state, saveCreds } = await useMultiFileAuthState(authDir);
      if (this.sessions.get(userId) !== entry) return;

      const version = await this.getBaileysVersion();

      const sock = makeWASocket({
        version,
        browser: Browsers.macOS('Desktop'),
        logger,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        generateHighQualityLinkPreview: true,
        markOnlineOnConnect: false,
        syncFullHistory: SYNC_FULL_HISTORY,
        getMessage: async (key) => {
          const jid = key.remoteJid;
          const id = key.id;
          if (!jid || !id) return undefined;
          return entry!.messageById.get(`${jid}:${id}`)?.message;
        },
      });

      entry.sock = sock;

      // Handle pairing code if requested
      if (phoneNumber && !state.creds.registered) {
        setTimeout(async () => {
          try {
            if (this.sessions.get(userId) !== entry) return;
            const cleaned = phoneNumber.replace(/\D/g, '');
            console.log(`[Baileys] Requesting pairing code for: ${cleaned}`);
            const code = await sock.requestPairingCode(cleaned);
            if (this.sessions.get(userId) !== entry) return;
            entry.pairingCode = code;
            entry.status = 'qr_ready';
            console.log(`[Baileys] Code generated: ${code}`);
          } catch (err: any) {
            console.error(`[Baileys] Pairing code error:`, err.message);
            if (this.sessions.get(userId) === entry) {
              entry.error = 'Failed to generate pairing code. Check number format.';
              entry.status = 'error';
            }
          }
        }, 1500);
      }

      entry.saveTimer = setInterval(() => {
        try {
          if (entry && this.sessions.get(userId) === entry) {
            writeSessionData(entry);
          } else {
            // Self-cleanup if orphaned
            if (entry) this.clearSaveTimer(entry);
          }
        } catch (error) {
          console.warn(`[WhatsApp] Data sync failed for ${userId}:`, error);
        }
      }, 30_000); // Increased interval to 30s for better stability

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (this.sessions.get(userId) !== entry) return;

        if (qr) {
          entry.qrRaw = qr;
          try {
            entry.qrCode = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
            entry.status = 'qr_ready';
            entry.error = null;
          } catch (e) {
             console.error('[WhatsApp] QR Generation Error:', e);
          }
        }

        if (connection === 'open') {
          entry.status = 'paired';
          entry.qrCode = null;
          entry.qrRaw = null;
          entry.error = null;
          entry.reconnecting = false;
          entry.phone = sock.user?.id ? jidNumber(sock.user.id) : 'connected';
          console.log(`[WhatsApp] Session active for ${userId} (${entry.phone})`);
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
          const loggedOut = statusCode === DisconnectReason.loggedOut;
          
          console.log(`[WhatsApp] Connection closed for ${userId}. Reason: ${statusCode || 'unknown'}`);

          entry.status = loggedOut ? 'disconnected' : 'error';
          entry.error = loggedOut ? null : (lastDisconnect?.error?.message || 'WhatsApp disconnected');
          entry.sock = null;
          entry.qrCode = null;
          this.clearSaveTimer(entry);

          if (!loggedOut) {
            this.reconnect(userId, 0);
          }
        }
      });

      sock.ev.on('messages.upsert', ({ messages }: any) => {
        if (this.sessions.get(userId) !== entry) return;

        for (const msg of messages || []) {
          const record = storeMessage(entry, msg);
          if (!record) continue;

          // Capture public profile name (pushName) from incoming messages to pair it with the JID
          if (record.chatId.endsWith('@s.whatsapp.net') && msg.pushName) {
            const existing = entry.contacts[record.chatId];
            const savedName = existing?.name && existing.name !== record.chatId ? existing.name : '';
            const notifyName = msg.pushName || existing?.notify || '';
            entry.contacts[record.chatId] = {
              id: record.chatId,
              name: savedName || notifyName || record.chatId,
              notify: notifyName || undefined,
              verifiedName: existing?.verifiedName || undefined,
              number: jidNumber(record.chatId),
            };
          }
        }
      });

      sock.ev.on('call', (calls: any[]) => {
        if (this.sessions.get(userId) !== entry) return;

        for (const call of calls || []) {
          const chatId = String(call.from || call.chatId || call.remoteJid || '');
          entry.calls.unshift({
            id: String(call.id || `${chatId}:${Date.now()}`),
            chatId,
            from: chatId,
            timestamp: timestampMs(call.date || call.timestamp || call.creation),
            status: String(call.status || call.reason || 'unknown'),
            isVideo: !!call.isVideo,
            fromMe: !!call.fromMe,
          });
        }

        entry.calls = entry.calls.slice(0, 100);
      });

      const updateContacts = (contacts: any[]) => {
        if (this.sessions.get(userId) !== entry) return;

        for (const contact of contacts || []) {
          const id = contact.id || contact.jid;
          if (!id || !String(id).endsWith('@s.whatsapp.net')) continue;
          
          const existing = entry.contacts[id];
          const savedName = contact.name || (existing?.name && existing.name !== id ? existing.name : '');
          const notifyName = contact.notify || contact.verifiedName || existing?.notify || '';

          entry.contacts[id] = {
            id,
            name: savedName || notifyName || id,
            notify: notifyName || undefined,
            verifiedName: contact.verifiedName || existing?.verifiedName || undefined,
            number: jidNumber(id),
          };
        }
      };

      sock.ev.on('messaging-history.set', ({ contacts, messages, progress, syncType, isLatest }: any) => {
        updateContacts(contacts || []);
        for (const msg of messages || []) {
          storeMessage(entry, msg);
        }

        entry.recentMessages.sort((a, b) => b.timestamp - a.timestamp);
        if (entry.recentMessages.length > MESSAGE_HISTORY_LIMIT) {
          entry.recentMessages.length = MESSAGE_HISTORY_LIMIT;
        }
        writeSessionData(entry);

        console.log(`[WhatsApp] History sync for ${userId}: +${(messages || []).length} messages, +${(contacts || []).length} contacts, progress=${progress ?? 'n/a'}, syncType=${syncType ?? 'n/a'}, latest=${isLatest ?? 'n/a'}`);
      });
      sock.ev.on('messaging-history.status', ({ status, syncType, explicit }: any) => {
        console.log(`[WhatsApp] History sync ${status} for ${userId}: syncType=${syncType}, explicit=${explicit}`);
      });
      sock.ev.on('contacts.upsert', updateContacts);
      sock.ev.on('contacts.update', updateContacts);

    } catch (err: any) {
      console.error(`[WhatsApp] Failed to initialize session for ${userId}:`, err.message);
      if (this.sessions.get(userId) === entry) {
        entry.status = 'error';
        entry.error = err.message || 'Failed to initialize WhatsApp session';
        
        const hasCreds = fs.existsSync(path.join(authDir, 'creds.json'));
        if (hasCreds) {
          this.reconnect(userId, 0);
        }
      }
    }
  }

  async getStatusOrStart(userId: string): Promise<{ status: string; qrCode?: string; phone?: string; error?: string; pairingCode?: string } | null> {
    const current = this.getStatus(userId);
    if (current) return current;

    const authDir = path.join(this.authRoot, safeUserId(userId));
    if (fs.existsSync(path.join(authDir, 'creds.json'))) {
      await this.startSession(userId);
      return this.getStatus(userId);
    }

    return null;
  }

  getStatus(userId: string): { status: string; qrCode?: string; phone?: string; error?: string; pairingCode?: string } | null {
    const entry = this.sessions.get(userId);
    if (!entry) return null;
    return {
      status: entry.status,
      qrCode: entry.qrCode || undefined,
      phone: entry.phone || undefined,
      error: entry.error || undefined,
      pairingCode: entry.pairingCode || undefined,
    };
  }

  getEffectivePermissions(userId: string, requestPermissions?: Record<string, any>): Record<string, any> {
    const defaults = defaultPermissions();
    const requestContext = requestPermissions || {};
    const approvalContext = {
      requireUserApproval: requestContext.requireUserApproval,
      approvedByUser: requestContext.approvedByUser,
      mode: requestContext.mode,
    };
    return { ...defaults, ...requestContext, ...approvalContext };
  }

  async sendCloudTextMessage(userId: string, to: string, text: string): Promise<{ chatId: string; messageId?: string } | null> {
    const accessToken = process.env.WA_CLOUD_ACCESS_TOKEN;
    const phoneNumberId = process.env.WA_CLOUD_PHONE_NUMBER_ID;
    const apiVersion = process.env.WA_CLOUD_API_VERSION || 'v23.0';
    if (!accessToken || !phoneNumberId) return null;

    const resolvedJid = this.resolveContactJid(userId, to);
    const resolvedNumber = jidNumber(resolvedJid);
    const recipient = cleanPhoneNumber(resolvedNumber || to, process.env.WA_DEFAULT_COUNTRY_CODE || '');
    if (!recipient) throw new Error('Recipient phone number required');

    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'text',
      text: { preview_url: false, body: text },
    };

    console.log(`[WhatsApp Cloud] Sending message to ${recipient} via Cloud API`);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data: any = await response.json();
    if (response.ok && data?.messages?.[0]?.id) {
      return { chatId: `${recipient}@cloud.whatsapp`, messageId: data.messages[0].id };
    } else {
      throw new Error(data?.error?.message || `WhatsApp Cloud API returned ${response.status}`);
    }
  }

  async sendWhatsAppMediaMessage(
    userId: string,
    to: string,
    mediaUrl: string,
    mediaType: 'image' | 'video' | 'document' | 'sticker' | 'audio',
    caption?: string,
    ptt?: boolean
  ): Promise<{ chatId: string; messageId?: string } | null> {
    const sock = this.getClient(userId);
    if (!sock) return null;

    const chatId = this.resolveContactJid(userId, to);
    const media: any = {};
    
    if (mediaType === 'image') media.image = { url: mediaUrl };
    else if (mediaType === 'video') media.video = { url: mediaUrl };
    else if (mediaType === 'sticker') media.sticker = { url: mediaUrl };
    else if (mediaType === 'audio') {
      media.audio = { url: mediaUrl };
      media.ptt = !!ptt;
      media.mimetype = 'audio/mpeg';
    } else media.document = { url: mediaUrl };

    if (caption && mediaType !== 'sticker' && mediaType !== 'audio') {
      media.caption = caption;
    }

    const sent = await sock.sendMessage(chatId, media);
    return { chatId, messageId: sent?.key?.id };
  }

  async sendWhatsAppPoll(userId: string, to: string, name: string, options: string[]): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    const chatId = this.resolveContactJid(userId, to);
    return sock.sendMessage(chatId, {
      poll: {
        name,
        values: options,
        selectableCount: 1
      }
    });
  }

  async sendWhatsAppReaction(userId: string, to: string, messageId: string, emoji: string): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    const chatId = this.resolveContactJid(userId, to);
    return sock.sendMessage(chatId, {
      react: { text: emoji, key: { remoteJid: chatId, id: messageId } }
    });
  }

  async deleteWhatsAppMessage(userId: string, to: string, messageId: string, revoke = false): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    const chatId = this.resolveContactJid(userId, to);
    return sock.sendMessage(chatId, {
      delete: { remoteJid: chatId, fromMe: true, id: messageId, participant: undefined }
    });
  }

  async markWhatsAppRead(userId: string, to: string, messageId: string): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    const chatId = this.resolveContactJid(userId, to);
    return sock.readMessages([{ remoteJid: chatId, id: messageId, fromMe: false }]);
  }

  async setWhatsAppPresence(userId: string, presence: 'available' | 'unavailable'): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    return sock.sendPresenceUpdate(presence);
  }

  async setWhatsAppChatPresence(userId: string, to: string, presence: 'composing' | 'recording' | 'paused'): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    const chatId = this.resolveContactJid(userId, to);
    return sock.sendPresenceUpdate(presence, chatId);
  }

  async getWhatsAppAvatar(userId: string, to: string): Promise<string | null> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    const chatId = this.resolveContactJid(userId, to);
    try {
      return await sock.profilePictureUrl(chatId, 'image');
    } catch {
      return null;
    }
  }

  async updateWhatsAppAvatar(userId: string, url: string): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    return sock.updateProfilePicture(sock.user.id, { url });
  }

  async updateWhatsAppPushName(userId: string, name: string): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    return sock.updateProfileName(name);
  }

  async checkWhatsAppUser(userId: string, number: string): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    const [result] = await sock.onWhatsApp(number);
    return result;
  }

  async createWhatsAppGroup(userId: string, title: string, participants: string[]): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    const jids = participants.map(p => this.resolveContactJid(userId, p));
    return sock.groupCreate(title, jids);
  }

  async joinWhatsAppGroup(userId: string, code: string): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    return sock.groupAcceptInvite(code);
  }

  async getWhatsAppGroupInvite(userId: string, groupId: string): Promise<string | null> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    return sock.groupInviteCode(groupId);
  }

  async updateWhatsAppGroupParticipants(userId: string, groupId: string, participants: string[], action: 'add' | 'remove' | 'promote' | 'demote'): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    const jids = participants.map(p => this.resolveContactJid(userId, p));
    return sock.groupParticipantsUpdate(groupId, jids, action);
  }

  async setWhatsAppGroupName(userId: string, groupId: string, name: string): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    return sock.groupUpdateSubject(groupId, name);
  }

  async setWhatsAppGroupTopic(userId: string, groupId: string, topic: string): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    return sock.groupUpdateDescription(groupId, topic);
  }

  async pinWhatsAppChat(userId: string, to: string, pin: boolean): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    const chatId = this.resolveContactJid(userId, to);
    return sock.chatModify({ pin }, chatId);
  }

  async setWhatsAppDisappearing(userId: string, to: string, duration: number): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    const chatId = this.resolveContactJid(userId, to);
    return sock.chatModify({ disappearingMessagesInChat: duration }, chatId);
  }

  // ─── FULL CRUD: Chat operations ──────────────────────────────
  async archiveWhatsAppChat(userId: string, to: string, archive: boolean): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    const chatId = this.resolveContactJid(userId, to);
    return sock.chatModify({ archive }, chatId);
  }

  async muteWhatsAppChat(userId: string, to: string, duration: number | null): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    const chatId = this.resolveContactJid(userId, to);
    // null = unmute, number = mute for that many seconds
    return sock.chatModify({ mute: duration }, chatId);
  }

  async deleteWhatsAppChat(userId: string, to: string): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    const chatId = this.resolveContactJid(userId, to);
    // Delete entire chat (for me only)
    return sock.chatModify({ delete: true }, chatId);
  }

  async clearWhatsAppChat(userId: string, to: string): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    const chatId = this.resolveContactJid(userId, to);
    // Clear all messages in the chat
    return sock.chatModify({ clear: { type: 'message', timer: null } }, chatId);
  }

  async markWhatsAppUnread(userId: string, to: string): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    const chatId = this.resolveContactJid(userId, to);
    return sock.chatModify({ markAsUnread: true }, chatId);
  }

  // ─── FULL CRUD: Contact operations ───────────────────────────
  async blockWhatsAppContact(userId: string, to: string, block: boolean): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    const jid = this.resolveContactJid(userId, to);
    return sock.updateBlockStatus(jid, block ? 'block' : 'unblock');
  }

  // ─── FULL CRUD: Message operations ───────────────────────────
  async sendWhatsAppContact(userId: string, to: string, contactName: string, phoneNumber: string): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return { ok: false, error: 'WhatsApp not connected' };
    const chatId = this.resolveContactJid(userId, to);
    const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${contactName}\nTEL;type=CELL;type=VOICE;waid=${phoneNumber.replace(/\D/g, '')}:${phoneNumber}\nEND:VCARD`;
    return sock.sendMessage(chatId, {
      contacts: { displayName: contactName, contacts: [{ vcard }] }
    });
  }

  async sendWhatsAppLocation(userId: string, to: string, latitude: number, longitude: number, name?: string): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return { ok: false, error: 'WhatsApp not connected' };
    const chatId = this.resolveContactJid(userId, to);
    return sock.sendMessage(chatId, {
      location: { degreesLatitude: latitude, degreesLongitude: longitude, name: name || '' }
    });
  }

  // ─── FULL CRUD: Group operations ─────────────────────────────
  async leaveWhatsAppGroup(userId: string, groupId: string): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    return sock.groupLeave(groupId);
  }

  async getWhatsAppGroupMetadata(userId: string, groupId: string): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    return sock.groupMetadata(groupId);
  }

  async updateWhatsAppGroupPhoto(userId: string, groupId: string, url: string): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    return sock.updateProfilePicture(groupId, { url });
  }

  async removeWhatsAppGroupPhoto(userId: string, groupId: string): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    return sock.removeProfilePicture(groupId);
  }

  async getWhatsAppGroupInviteLink(userId: string, groupId: string): Promise<string> {
    const sock = this.getClient(userId);
    if (!sock) return '';
    const code = await sock.groupInviteCode(groupId);
    return `https://chat.whatsapp.com/${code}`;
  }

  async revokeWhatsAppGroupInvite(userId: string, groupId: string): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    return sock.groupRevokeInvite(groupId);
  }

  async getWhatsAppBusinessProfile(userId: string, jid: string): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    try {
      return await sock.getBusinessProfile(jid);
    } catch { return null; }
  }

  async setWhatsAppGroupSetting(userId: string, groupId: string, setting: 'announcement' | 'member_add_mode', value: boolean): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    return sock.groupSettingUpdate(groupId, setting, value ? 'on' : 'off');
  }

  async getWhatsAppStatus(userId: string, jid: string): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    try {
      return await sock.fetchStatus(jid);
    } catch { return null; }
  }

  async starWhatsAppMessage(userId: string, to: string, messageId: string, starred: boolean): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    const chatId = this.resolveContactJid(userId, to);
    return sock.chatModify({
      star: { messages: [{ id: messageId, fromMe: true, remoteJid: chatId }], star: starred }
    }, chatId);
  }

  async getWhatsAppCommunityParticipants(userId: string, groupId: string): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return null;
    try {
      return await sock.groupMetadata(groupId);
    } catch { return null; }
  }

  async sendWhatsAppReactionToMessage(userId: string, to: string, messageId: string, emoji: string): Promise<any> {
    const sock = this.getClient(userId);
    if (!sock) return { ok: false, error: 'WhatsApp not connected' };
    const chatId = this.resolveContactJid(userId, to);
    return sock.sendMessage(chatId, { react: { text: emoji, key: { remoteJid: chatId, fromMe: true, id: messageId } } });
  }

  ingestCloudWebhook(userId: string, payload: any): { accepted: number } {
    const safeId = safeUserId(userId);
    const authDir = path.join(this.authRoot, safeId);
    const dataFile = path.join(authDir, 'session-data.json');
    ensureDir(authDir);

    let entry = this.sessions.get(userId);
    if (!entry) {
      const savedData = readSessionData(dataFile);
      entry = {
        userId,
        status: 'paired',
        qrCode: null,
        qrRaw: null,
        phone: null,
        sock: null,
        authDir,
        dataFile,
        error: null,
        recentMessages: savedData.recentMessages,
        calls: savedData.calls,
        contacts: savedData.contacts,
        messageById: new Map(),
        reconnecting: false,
        saveTimer: null,
      };
      this.sessions.set(userId, entry);
    }

    let accepted = 0;
    for (const root of payload?.entry || []) {
      for (const change of root?.changes || []) {
        for (const msg of change?.value?.messages || []) {
          const from = msg.from || '';
          const chatId = from ? `${from}@cloud.whatsapp` : `cloud:${Date.now()}`;
          const body = msg.text?.body || msg.button?.text || msg.interactive?.button_reply?.title || '[cloud message]';
          entry.recentMessages.unshift({
            id: msg.id || `${chatId}:${Date.now()}`,
            chatId,
            from,
            body: String(body).slice(0, 1000),
            timestamp: msg.timestamp ? Number(msg.timestamp) * 1000 : Date.now(),
            fromMe: false,
            isGroup: false,
            isMedia: !!msg.image || !!msg.video || !!msg.document || !!msg.audio,
          });
          accepted++;
        }
      }
    }

    entry.recentMessages = entry.recentMessages.slice(0, MESSAGE_HISTORY_LIMIT);
    writeSessionData(entry);
    return { accepted };
  }

  getRecentMessages(userId: string, limit = 20): WaRecentMessage[] {
    const entry = this.sessions.get(userId);
    if (!entry) return [];
    return entry.recentMessages.slice(0, Math.min(limit, HISTORY_RESPONSE_LIMIT));
  }

  getCalls(userId: string, limit = 20): WaCallRecord[] {
    const entry = this.sessions.get(userId);
    if (!entry) return [];
    return entry.calls.slice(0, Math.min(limit, 50));
  }

  getChats(userId: string, limit = 20): WaChatSummary[] {
    const entry = this.sessions.get(userId);
    if (!entry) return [];

    const byId = new Map<string, WaChatSummary>();
    for (const msg of entry.recentMessages) {
      const current = byId.get(msg.chatId);
      if (!current || msg.timestamp >= current.timestamp) {
        byId.set(msg.chatId, {
          id: msg.chatId,
          name: current?.name || entry.contacts[msg.chatId]?.name || msg.chatId,
          unreadCount: current?.unreadCount || 0,
          lastMessage: msg.body.slice(0, 160),
          timestamp: msg.timestamp,
          isGroup: msg.isGroup,
        });
      }
    }

    return [...byId.values()]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, Math.min(limit, 100));
  }

  getContacts(userId: string, limit = 100): WaContactSummary[] {
    const entry = this.sessions.get(userId);
    if (!entry?.contacts) return [];

    return Object.values(entry.contacts)
      .filter(contact => contact.id.endsWith('@s.whatsapp.net'))
      .slice(0, Math.min(limit, 500));
  }

  resolveContactJid(userId: string, nameOrNumberOrJid: string): string {
    const input = String(nameOrNumberOrJid || '').trim();
    if (!input) return '';

    // If it's already a JID, return it
    if (input.endsWith('@s.whatsapp.net') || input.endsWith('@g.us') || input.endsWith('@broadcast')) {
      return input;
    }

    // If it contains only digits (with optional leading +), it's a number
    const isNumber = /^\+?\d+$/.test(input);
    if (isNumber) {
      return toWhatsAppJid(input);
    }

    // Otherwise, search contacts by name
    const entry = this.sessions.get(userId);
    if (entry?.contacts) {
      const searchName = input.toLowerCase();

      // 1. Try exact match on saved phone book name
      let match = Object.values(entry.contacts).find(
        c => c.name && c.name.toLowerCase() === searchName
      );
      if (match) return match.id;

      // 2. Try exact match on notify (WhatsApp public profile pushname)
      match = Object.values(entry.contacts).find(
        c => c.notify && c.notify.toLowerCase() === searchName
      );
      if (match) return match.id;

      // 3. Try exact match on verified business name
      match = Object.values(entry.contacts).find(
        c => c.verifiedName && c.verifiedName.toLowerCase() === searchName
      );
      if (match) return match.id;

      // 4. Try partial case-insensitive match on saved name
      match = Object.values(entry.contacts).find(
        c => c.name && c.name.toLowerCase().includes(searchName)
      );
      if (match) return match.id;

      // 5. Try partial case-insensitive match on notify name
      match = Object.values(entry.contacts).find(
        c => c.notify && c.notify.toLowerCase().includes(searchName)
      );
      if (match) return match.id;
    }

    // Fallback: clean digits anyway
    return toWhatsAppJid(input);
  }

  async getGroups(userId: string): Promise<WaChatSummary[]> {
    const sock = this.getClient(userId);
    if (!sock) return [];
    const groups = await sock.groupFetchAllParticipating();
    return Object.entries(groups).map(([id, meta]: [string, any]) => ({
      id,
      name: meta.subject || id,
      unreadCount: 0,
      lastMessage: '',
      timestamp: timestampMs(meta.creation),
      isGroup: true,
    }));
  }

  getMessageHistory(userId: string, chatId: string, limit = 20): WaRecentMessage[] {
    const entry = this.sessions.get(userId);
    if (!entry) return [];
    const jid = toWhatsAppJid(chatId, chatId.endsWith('@g.us'));
    return entry.recentMessages
      .filter(message => message.chatId === jid)
      .slice(0, Math.min(limit, HISTORY_RESPONSE_LIMIT));
  }

  async disconnect(userId: string): Promise<void> {
    const entry = this.sessions.get(userId);
    if (!entry) return;
    try {
      if (entry.sock) {
        await entry.sock.logout().catch(async () => entry.sock?.end?.(undefined));
      }
    } catch (error) {
      console.error(`WhatsApp disconnect error for ${userId}:`, error);
    }

    this.clearSaveTimer(entry);
    this.clearReconnectTimer(entry);
    this.sessions.delete(userId);
    fs.rmSync(entry.authDir, { recursive: true, force: true });
  }

  getClient(userId: string): any {
    const entry = this.sessions.get(userId);
    if (!entry || entry.status !== 'paired' || !entry.sock) return null;
    return entry.sock;
  }

  isPaired(userId: string): boolean {
    return this.sessions.get(userId)?.status === 'paired';
  }

  async shutdown(): Promise<void> {
    for (const entry of this.sessions.values()) {
      this.clearSaveTimer(entry);
      this.clearReconnectTimer(entry);
      try {
        writeSessionData(entry);
        entry.sock?.end?.(undefined);
      } catch {}
    }
    this.sessions.clear();
  }

  private clearSaveTimer(entry: WaSession) {
    if (entry.saveTimer) {
      clearInterval(entry.saveTimer);
      entry.saveTimer = null;
    }
  }

  private clearReconnectTimer(entry: WaSession) {
    if (entry.reconnectTimer) {
      clearTimeout(entry.reconnectTimer);
      entry.reconnectTimer = null;
    }
  }

}
