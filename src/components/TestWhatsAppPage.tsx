import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Check,
  CheckCheck,
  Loader2,
  MessageCircle,
  QrCode,
  RefreshCw,
  Send,
  Server,
  Smartphone,
  X,
} from 'lucide-react';
import {
  callWhatsAppTool,
  DELEGATED_SEND_PERMISSIONS,
  disconnectWhatsApp,
  getBackendUrl,
  getWhatsAppStatus,
  setBackendUrl,
  startWhatsAppPairing,
  type WaChatSummary,
  type WaMessageRecord,
} from '../lib/whatsappClient';

const TEST_PERMISSIONS = {
  send_messages: true,
  read_chats: true,
  access_contacts: true,
  manage_contacts: true,
  access_groups: true,
  send_group_messages: true,
  read_group_chats: true,
  view_message_history: true,
};

type SendPreview = {
  to: string;
  text: string;
};

function formatClock(timestamp?: number): string {
  if (!timestamp) return '';
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function statusLabel(status: string): string {
  if (status === 'paired') return 'Connected';
  if (status === 'qr_ready') return 'Scan QR';
  if (status === 'init') return 'Starting';
  if (status === 'error') return 'Error';
  return 'Disconnected';
}

export function TestWhatsAppPage() {
  const [backendInput, setBackendInput] = useState(getBackendUrl());
  const [backend, setBackend] = useState(getBackendUrl());
  const [userId, setUserId] = useState(() => {
    try { return localStorage.getItem('test_whatsapp_user_id') || 'master-e'; } catch { return 'master-e'; }
  });
  const [status, setStatus] = useState<any>({ status: 'unknown' });
  const [qrBust, setQrBust] = useState(Date.now());
  const [chats, setChats] = useState<WaChatSummary[]>([]);
  const [selectedChat, setSelectedChat] = useState<WaChatSummary | null>(null);
  const [messages, setMessages] = useState<WaMessageRecord[]>([]);
  const [messageText, setMessageText] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [preview, setPreview] = useState<SendPreview | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const qrUrl = useMemo(() => {
    return `${backend}/api/whatsapp/qr/${encodeURIComponent(userId)}?t=${qrBust}`;
  }, [backend, userId, qrBust]);

  const activeRecipient = selectedChat?.id || phoneInput.trim();

  const applyBackend = () => {
    const next = setBackendUrl(backendInput);
    setBackendInput(next);
    setBackend(next);
    setNotice(`Backend set to ${next}`);
  };

  const loadStatus = async () => {
    setLoadingStatus(true);
    setError('');
    try {
      const next = await getWhatsAppStatus(userId);
      setStatus(next);
      if (next.qrCode || next.status === 'qr_ready') setQrBust(Date.now());
    } catch (err: any) {
      setError(err.message || 'Failed to load WhatsApp status');
    } finally {
      setLoadingStatus(false);
    }
  };

  const startPairing = async () => {
    setError('');
    setNotice('');
    try {
      await startWhatsAppPairing(userId);
      setNotice('Pairing session started. Scan the QR code with WhatsApp Linked Devices.');
      await loadStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to start pairing');
    }
  };

  const disconnect = async () => {
    setError('');
    try {
      await disconnectWhatsApp(userId);
      setChats([]);
      setMessages([]);
      setSelectedChat(null);
      setNotice('WhatsApp session disconnected.');
      await loadStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect WhatsApp');
    }
  };

  const loadChats = async () => {
    setLoadingChats(true);
    setError('');
    try {
      const result = await callWhatsAppTool(userId, 'readChats', { limit: 100 }, TEST_PERMISSIONS);
      if (!result?.ok) throw new Error(result?.error || 'Failed to load chats');
      const nextChats = Array.isArray(result.chats) ? result.chats : [];
      setChats(nextChats);
      if (!selectedChat && nextChats[0]) setSelectedChat(nextChats[0]);
      setNotice(`Loaded ${nextChats.length} chats.`);
    } catch (err: any) {
      setError(err.message || 'Failed to load chats');
    } finally {
      setLoadingChats(false);
    }
  };

  const loadMessages = async (chatId = selectedChat?.id) => {
    if (!chatId) return;
    setLoadingMessages(true);
    setError('');
    try {
      const result = await callWhatsAppTool(userId, 'getMessageHistory', { chatId, limit: 2000 }, TEST_PERMISSIONS);
      if (!result?.ok) throw new Error(result?.error || 'Failed to load message history');
      setMessages(Array.isArray(result.messages) ? result.messages : []);
      setNotice('Loaded deep chat history for style testing.');
    } catch (err: any) {
      setError(err.message || 'Failed to load message history');
    } finally {
      setLoadingMessages(false);
    }
  };

  const openSendPreview = () => {
    setError('');
    const to = activeRecipient;
    const text = messageText.trim();
    if (!to) {
      setError('Select a chat or enter a WhatsApp phone/JID first.');
      return;
    }
    if (!text) {
      setError('Type a message first.');
      return;
    }
    setPreview({ to, text });
  };

  const sendApprovedMessage = async () => {
    if (!preview) return;
    setSending(true);
    setError('');
    try {
      const result = await callWhatsAppTool(
        userId,
        'sendMessage',
        { to: preview.to, text: preview.text },
        { ...TEST_PERMISSIONS, ...DELEGATED_SEND_PERMISSIONS },
      );
      if (!result?.ok) throw new Error(result?.error || 'Message failed');
      setNotice(`Sent to ${result.chatId || preview.to}`);
      setMessageText('');
      setPreview(null);
      await loadMessages(preview.to);
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    try { localStorage.setItem('test_whatsapp_user_id', userId); } catch {}
  }, [userId]);

  useEffect(() => {
    loadStatus();
    const id = window.setInterval(loadStatus, 5000);
    return () => window.clearInterval(id);
  }, [userId, backend]);

  useEffect(() => {
    if (selectedChat?.id) loadMessages(selectedChat.id);
  }, [selectedChat?.id]);

  useEffect(() => {
    if (status.status === 'paired' && chats.length === 0 && !loadingChats) {
      loadChats();
    }
  }, [status.status]);

  return (
    <div className="min-h-screen bg-wa-bg-main text-wa-text-primary flex flex-col overflow-hidden">
      <div className="wa-chat-bg opacity-[0.04]" />
      
      {/* ── Header ── */}
      <header className="shrink-0 flex flex-col gap-3 border-b border-white/5 bg-wa-bg-header px-4 py-3 sm:flex-row sm:items-center sm:justify-between z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-wa-green text-wa-bg-main shadow-lg">
            <MessageCircle className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">WhatsApp Backend Test</h1>
            <p className="text-[10px] text-wa-text-secondary uppercase tracking-widest font-black">Route: /test-whatsapp</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(260px,360px)_auto_auto]">
          <label className="relative block">
            <span className="sr-only">Backend URL</span>
            <Server className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-wa-text-secondary" />
            <input
              value={backendInput}
              onChange={(event) => setBackendInput(event.target.value)}
              className="h-10 w-full rounded-xl border border-white/5 bg-wa-bg-sidebar pl-9 pr-3 text-sm text-wa-text-primary outline-none focus:border-wa-green/50 shadow-inner"
              placeholder="http://localhost:4200"
            />
          </label>
          <button
            onClick={applyBackend}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-wa-green px-4 text-sm font-bold text-wa-bg-main hover:brightness-110 active:scale-95 transition-all shadow-md shadow-wa-green/20"
          >
            <Check className="h-4 w-4" />
            Use
          </button>
          <a
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-wa-text-primary hover:bg-white/10 transition-all"
          >
            Exit
          </a>
        </div>
      </header>

      {/* ── Main Area ── */}
      <main className="flex-1 grid grid-cols-1 overflow-hidden md:grid-cols-[360px_minmax(0,1fr)] z-0">
        {/* Left Column: Side Controls & Chat List */}
        <aside className="flex flex-col border-b border-white/5 bg-wa-bg-sidebar md:border-b-0 md:border-r h-full overflow-hidden">
          {/* Status & Control Section */}
          <section className="shrink-0 space-y-3 border-b border-white/5 p-4 bg-wa-bg-main/30">
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-wa-text-secondary">Test user ID</span>
              <input
                value={userId}
                onChange={(event) => setUserId(event.target.value.trim())}
                className="h-9 w-full rounded-lg border border-white/5 bg-wa-bg-header px-3 text-xs text-wa-text-primary outline-none focus:border-wa-green/50"
              />
            </label>

            <div className="flex items-center justify-between rounded-xl bg-wa-bg-header p-3 border border-white/5 shadow-sm">
              <div className="flex items-center gap-3">
                <Smartphone className="h-5 w-5 text-wa-green" />
                <div>
                  <p className="text-xs font-bold">{statusLabel(status.status)}</p>
                  <p className="text-[10px] text-wa-text-secondary truncate max-w-[180px]">{status.phone || status.error || backend}</p>
                </div>
              </div>
              <button
                onClick={loadStatus}
                disabled={loadingStatus}
                className="rounded-full p-2 text-wa-text-secondary hover:text-white hover:bg-white/5 disabled:opacity-50 transition-colors"
                aria-label="Refresh status"
              >
                {loadingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={startPairing}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-wa-green text-xs font-bold text-wa-bg-main hover:brightness-110 active:scale-95 transition-all"
              >
                <QrCode className="h-4 w-4" />
                Pair
              </button>
              <button
                onClick={disconnect}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-red-500/10 text-xs font-bold text-red-400 border border-red-500/20 hover:bg-red-500/20 active:scale-95 transition-all"
              >
                <X className="h-4 w-4" />
                Reset
              </button>
            </div>

            {(status.status === 'qr_ready' || status.qrCode) && (
              <div className="rounded-xl bg-white p-2.5 shadow-xl">
                <img
                  src={status.qrCode || qrUrl}
                  alt="WhatsApp pairing QR code"
                  className="mx-auto aspect-square w-48 rounded-lg"
                  onError={() => setQrBust(Date.now())}
                />
              </div>
            )}
          </section>

          {/* Chat List Section */}
          <section className="flex-1 flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between border-b border-white/5 px-4 py-2.5 bg-wa-bg-header/50">
              <div>
                <p className="text-xs font-bold tracking-tight">Chats</p>
                <p className="text-[10px] text-wa-text-secondary">{chats.length} loaded</p>
              </div>
              <button
                onClick={loadChats}
                disabled={loadingChats}
                className="p-2 rounded-lg text-wa-text-secondary hover:text-wa-green hover:bg-white/5 transition-all disabled:opacity-50"
              >
                {loadingChats ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {chats.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-xs text-wa-text-secondary font-medium italic">
                    {loadingChats ? 'Loading chats...' : 'Sync chats to start testing.'}
                  </p>
                </div>
              ) : (
                chats.map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => {
                      setSelectedChat(chat);
                      setPhoneInput('');
                    }}
                    className={`flex w-full items-center gap-3 border-b border-white/[0.02] px-4 py-3 text-left transition-colors ${
                      selectedChat?.id === chat.id ? 'bg-wa-bg-header border-wa-green/20' : 'hover:bg-wa-bg-header/30'
                    }`}
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-wa-bg-header border border-white/5 text-sm font-black text-wa-text-primary overflow-hidden">
                      {(chat.name || chat.id || '?').slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-wa-text-primary">{chat.name || chat.id}</p>
                        <span className="text-[10px] font-medium text-wa-text-secondary shrink-0">{formatClock(chat.timestamp)}</span>
                      </div>
                      <p className="truncate text-[11px] text-wa-text-secondary mt-0.5">{chat.lastMessage || chat.id}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
        </aside>

        {/* Right Column: Conversation Thread & Input */}
        <section className="flex flex-col bg-wa-bg-main h-full overflow-hidden relative">
          {/* Thread Header (Sticky) */}
          <header className="shrink-0 flex items-center justify-between border-b border-black/20 bg-wa-bg-header px-4 py-2.5 z-10">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold text-wa-text-primary leading-tight">
                {selectedChat?.name || phoneInput || 'Select a chat'}
              </p>
              <p className="truncate text-[10px] text-wa-green font-black uppercase tracking-widest mt-0.5">
                {selectedChat ? 'Synced Thread' : 'Manual Entry'}
              </p>
            </div>
            <button
              onClick={() => loadMessages()}
              disabled={!selectedChat || loadingMessages}
              className="inline-flex h-8 items-center justify-center gap-2 rounded-lg bg-wa-bg-sidebar border border-white/10 px-3 text-xs font-bold text-wa-text-secondary hover:text-white transition-all disabled:opacity-40"
            >
              {loadingMessages ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              History
            </button>
          </header>

          {(notice || error) && (
            <div className={`shrink-0 mx-4 mt-3 rounded-lg px-3 py-2 text-xs font-medium z-10 ${error ? 'bg-red-500/15 text-red-100 border border-red-500/20' : 'bg-wa-green/10 text-wa-green border border-wa-green/20'}`}>
              {error || notice}
            </div>
          )}

          {/* Messages Area (Scrolling) */}
          <div className="flex-1 overflow-y-auto px-4 py-6 z-0 flex flex-col gap-2">
            {messages.length === 0 ? (
              <div className="my-auto mx-auto max-w-xs rounded-2xl bg-wa-bg-sidebar border border-white/5 p-6 text-center shadow-xl">
                <MessageCircle className="w-8 h-8 text-wa-text-secondary/20 mx-auto mb-3" />
                <p className="text-[13px] text-wa-text-secondary font-medium leading-relaxed">
                  {loadingMessages ? 'Decrypting conversation...' : 'Select a chat to view synchronized history for testing.'}
                </p>
              </div>
            ) : (
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-1.5">
                {[...messages].reverse().map((message) => (
                  <div
                    key={`${message.chatId}:${message.id}`}
                    className={`flex ${message.fromMe ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`relative max-w-[85%] rounded-xl px-2.5 py-1.5 shadow-sm ${
                      message.fromMe 
                        ? 'bg-wa-bubble-out text-wa-text-primary rounded-tr-none' 
                        : 'bg-wa-bubble-in text-wa-text-primary rounded-tl-none border border-white/[0.02]'
                    }`}>
                      <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">{message.body}</p>
                      <div className="mt-1 flex justify-end gap-1.5 text-[10px] text-white/40 font-medium translate-y-0.5">
                        <span>{formatClock(message.timestamp)}</span>
                        {message.fromMe && <CheckCheck className="w-3.5 h-3.5 text-wa-check-blue" />}
                      </div>
                      
                      {/* Tail */}
                      <div className={`absolute top-0 w-2 h-2 ${message.fromMe ? '-right-1 bg-wa-bubble-out' : '-left-1 bg-wa-bubble-in border-l border-t border-white/[0.02]'} rotate-45 rounded-sm`} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Input Footer (Sticky) */}
          <footer className="shrink-0 border-t border-black/20 bg-wa-bg-header/95 backdrop-blur-md p-3 z-10">
            <div className="mx-auto max-w-4xl space-y-2">
              <div className="flex gap-2 items-center">
                <div className="flex-1 flex gap-2 items-center bg-wa-bg-sidebar rounded-xl px-3 h-9 border border-white/[0.05]">
                   <Smartphone className="w-4 h-4 text-wa-text-secondary shrink-0" />
                   <input
                    value={phoneInput}
                    onChange={(event) => {
                      setPhoneInput(event.target.value);
                      if (event.target.value.trim()) setSelectedChat(null);
                    }}
                    className="flex-1 bg-transparent text-xs text-wa-text-primary outline-none placeholder-wa-text-secondary/50"
                    placeholder="Recipient phone or JID (e.g. 32470...)"
                  />
                  <span className="text-[9px] font-black uppercase text-wa-green tracking-widest opacity-50 shrink-0">
                    Target: {activeRecipient ? 'Active' : 'Missing'}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 items-center">
                <div className="flex-1 bg-wa-bg-sidebar rounded-xl border border-white/[0.05] p-1 shadow-inner">
                  <textarea
                    value={messageText}
                    onChange={(event) => setMessageText(event.target.value)}
                    className="w-full max-h-32 min-h-[44px] resize-none bg-transparent px-3 py-2.5 text-[14px] text-wa-text-primary outline-none placeholder-wa-text-secondary/50"
                    placeholder="Type a test message..."
                  />
                </div>
                <button
                  onClick={openSendPreview}
                  disabled={!activeRecipient || !messageText.trim()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-wa-green text-wa-bg-main hover:brightness-110 active:scale-95 transition-all shadow-md shadow-wa-green/20 disabled:opacity-30"
                  aria-label="Preview send"
                >
                  <Send className="h-5 w-5" strokeWidth={2.5} />
                </button>
              </div>
            </div>
          </footer>
        </section>
      </main>

      {/* ── Modals ── */}
      <AnimatePresence>
        {preview && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md rounded-[28px] bg-wa-bg-header p-6 shadow-2xl border border-white/5 ring-1 ring-white/10"
            >
              <h2 className="text-lg font-bold text-wa-text-primary">Send WhatsApp Message?</h2>
              <div className="mt-2 flex items-center gap-2">
                <div className="px-2 py-0.5 rounded bg-wa-green/10 text-wa-green text-[10px] font-black tracking-widest uppercase">To</div>
                <p className="break-all text-xs font-mono text-wa-text-secondary">{preview.to}</p>
              </div>
              
              <div className="my-6 relative">
                <div className="absolute top-0 left-0 w-1 h-full bg-wa-green rounded-full opacity-50" />
                <div className="pl-4 py-1">
                  <p className="text-[14px] text-wa-text-primary leading-relaxed whitespace-pre-wrap">{preview.text}</p>
                </div>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-3">
                <button
                  onClick={() => setPreview(null)}
                  className="h-11 rounded-2xl border border-white/10 bg-white/5 text-sm font-bold text-wa-text-primary hover:bg-white/10 transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={sendApprovedMessage}
                  disabled={sending}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-wa-green text-sm font-bold text-wa-bg-main hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                >
                  {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" strokeWidth={2.5} />}
                  Send Now
                </button>
              </div>
              
              <p className="mt-5 text-[9px] text-wa-text-secondary/40 text-center uppercase tracking-widest font-black">
                Delegated Mode · Master E Protocol
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
