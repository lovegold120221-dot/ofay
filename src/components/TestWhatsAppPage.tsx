import { useEffect, useMemo, useState } from 'react';
import {
  Check,
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

  return (
    <div className="min-h-screen bg-[#0b141a] text-[#e9edef]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col">
        <header className="flex flex-col gap-3 border-b border-white/10 bg-[#202c33] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00a884] text-[#0b141a]">
              <MessageCircle className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">WhatsApp Backend Test</h1>
              <p className="text-xs text-[#8696a0]">Route: /test-whatsapp</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(260px,360px)_auto_auto]">
            <label className="relative block">
              <span className="sr-only">Backend URL</span>
              <Server className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8696a0]" />
              <input
                value={backendInput}
                onChange={(event) => setBackendInput(event.target.value)}
                className="h-10 w-full rounded-lg border border-white/10 bg-[#111b21] pl-9 pr-3 text-sm text-[#e9edef] outline-none focus:border-[#00a884]"
                placeholder="http://localhost:4200"
              />
            </label>
            <button
              onClick={applyBackend}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#00a884] px-4 text-sm font-semibold text-[#0b141a] hover:bg-[#06cf9c]"
            >
              <Check className="h-4 w-4" />
              Use
            </button>
            <a
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-white/10 px-4 text-sm font-semibold text-[#d1d7db] hover:bg-white/5"
            >
              Exit
            </a>
          </div>
        </header>

        <main className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="border-b border-white/10 bg-[#111b21] md:border-b-0 md:border-r">
            <section className="space-y-3 border-b border-white/10 p-4">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#8696a0]">Test user ID</span>
                <input
                  value={userId}
                  onChange={(event) => setUserId(event.target.value.trim())}
                  className="h-10 w-full rounded-lg border border-white/10 bg-[#202c33] px-3 text-sm text-[#e9edef] outline-none focus:border-[#00a884]"
                />
              </label>

              <div className="flex items-center justify-between rounded-xl bg-[#202c33] p-3">
                <div className="flex items-center gap-3">
                  <Smartphone className="h-5 w-5 text-[#00a884]" />
                  <div>
                    <p className="text-sm font-semibold">{statusLabel(status.status)}</p>
                    <p className="text-xs text-[#8696a0]">{status.phone || status.error || backend}</p>
                  </div>
                </div>
                <button
                  onClick={loadStatus}
                  disabled={loadingStatus}
                  className="rounded-full p-2 text-[#8696a0] hover:bg-white/10 hover:text-white disabled:opacity-50"
                  aria-label="Refresh status"
                  title="Refresh status"
                >
                  {loadingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={startPairing}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#00a884] text-sm font-semibold text-[#0b141a] hover:bg-[#06cf9c]"
                >
                  <QrCode className="h-4 w-4" />
                  Pair
                </button>
                <button
                  onClick={disconnect}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#2a3942] text-sm font-semibold text-[#ffb4a9] hover:bg-[#354852]"
                >
                  <X className="h-4 w-4" />
                  Reset
                </button>
              </div>

              {(status.status === 'qr_ready' || status.qrCode) && (
                <div className="rounded-xl bg-white p-3">
                  <img
                    src={status.qrCode || qrUrl}
                    alt="WhatsApp pairing QR code"
                    className="mx-auto aspect-square w-52 rounded-lg"
                    onError={() => setQrBust(Date.now())}
                  />
                </div>
              )}
            </section>

            <section className="flex h-[42dvh] flex-col md:h-[calc(100dvh-325px)]">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">Chats</p>
                  <p className="text-xs text-[#8696a0]">{chats.length} loaded</p>
                </div>
                <button
                  onClick={loadChats}
                  disabled={loadingChats}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#2a3942] px-3 text-sm font-semibold hover:bg-[#354852] disabled:opacity-50"
                >
                  {loadingChats ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Load
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {chats.length === 0 ? (
                  <div className="p-5 text-sm text-[#8696a0]">
                    Load chats after pairing. If it says WhatsApp not paired, scan the QR first.
                  </div>
                ) : (
                  chats.map((chat) => (
                    <button
                      key={chat.id}
                      onClick={() => {
                        setSelectedChat(chat);
                        setPhoneInput('');
                      }}
                      className={`flex w-full items-center gap-3 border-b border-white/5 px-4 py-3 text-left hover:bg-[#202c33] ${
                        selectedChat?.id === chat.id ? 'bg-[#2a3942]' : ''
                      }`}
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-base font-bold text-[#0b141a]">
                        {(chat.name || chat.id || '?').slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold">{chat.name || chat.id}</p>
                          <span className="text-[11px] text-[#8696a0]">{formatClock(chat.timestamp)}</span>
                        </div>
                        <p className="truncate text-xs text-[#8696a0]">{chat.lastMessage || chat.id}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>
          </aside>

          <section className="flex min-h-[65dvh] flex-col bg-[#0b141a] md:min-h-0">
            <div className="flex items-center justify-between border-b border-white/10 bg-[#202c33] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{selectedChat?.name || phoneInput || 'Select a chat'}</p>
                <p className="truncate text-xs text-[#8696a0]">{selectedChat?.id || 'Or enter a number/JID below'}</p>
              </div>
              <button
                onClick={() => loadMessages()}
                disabled={!selectedChat || loadingMessages}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#2a3942] px-3 text-sm font-semibold hover:bg-[#354852] disabled:opacity-40"
              >
                {loadingMessages ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                History
              </button>
            </div>

            {(notice || error) && (
              <div className={`mx-4 mt-3 rounded-lg px-3 py-2 text-sm ${error ? 'bg-red-500/15 text-red-100' : 'bg-[#005c4b] text-[#d9fdd3]'}`}>
                {error || notice}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(0,168,132,0.08),transparent_34%)] px-3 py-4">
              {messages.length === 0 ? (
                <div className="mx-auto mt-12 max-w-sm rounded-xl bg-[#202c33] p-4 text-center text-sm text-[#8696a0]">
                  No messages loaded yet. Select a chat and load history; paired sessions can return up to 2000 records for style testing.
                </div>
              ) : (
                <div className="mx-auto flex max-w-3xl flex-col gap-2">
                  {[...messages].reverse().map((message) => (
                    <div
                      key={`${message.chatId}:${message.id}`}
                      className={`flex ${message.fromMe ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[78%] rounded-lg px-3 py-2 shadow-sm ${
                        message.fromMe ? 'bg-[#005c4b] text-[#e9edef]' : 'bg-[#202c33] text-[#e9edef]'
                      }`}>
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.body}</p>
                        <div className="mt-1 flex justify-end gap-1 text-[10px] text-[#aebac1]">
                          <span>{formatClock(message.timestamp)}</span>
                          {message.fromMe && <span>✓✓</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-white/10 bg-[#202c33] p-3">
              <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
                <input
                  value={phoneInput}
                  onChange={(event) => {
                    setPhoneInput(event.target.value);
                    if (event.target.value.trim()) setSelectedChat(null);
                  }}
                  className="h-10 rounded-lg border border-white/10 bg-[#111b21] px-3 text-sm outline-none focus:border-[#00a884]"
                  placeholder="Optional recipient phone/JID if no chat is selected"
                />
                <span className="flex h-10 items-center rounded-lg bg-[#111b21] px-3 text-xs text-[#8696a0]">
                  {activeRecipient || 'No recipient'}
                </span>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_44px] gap-2">
                <textarea
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  className="max-h-32 min-h-11 resize-none rounded-lg border border-white/10 bg-[#111b21] px-3 py-3 text-sm outline-none focus:border-[#00a884]"
                  placeholder="Type a test message..."
                />
                <button
                  onClick={openSendPreview}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-[#00a884] text-[#0b141a] hover:bg-[#06cf9c]"
                  aria-label="Preview send"
                  title="Preview send"
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#111b21] p-5 shadow-2xl ring-1 ring-white/10">
            <h2 className="text-lg font-semibold">Send this WhatsApp message?</h2>
            <p className="mt-1 break-all text-xs text-[#8696a0]">{preview.to}</p>
            <div className="my-4 rounded-xl bg-[#005c4b] p-3 text-sm text-[#e9edef]">
              {preview.text}
            </div>
            <p className="text-xs text-[#8696a0]">
              This sends with delegated approval metadata: requireUserApproval, approvedByUser, mode=delegated_send.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                onClick={() => setPreview(null)}
                className="h-10 rounded-lg border border-white/10 text-sm font-semibold hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={sendApprovedMessage}
                disabled={sending}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#00a884] text-sm font-semibold text-[#0b141a] hover:bg-[#06cf9c] disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
