import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  RefreshCw,
  Search,
  Users,
  User,
  Lock,
  AlertCircle,
  MessageSquare,
  CheckCheck,
} from 'lucide-react';
import {
  fetchWhatsAppChats,
  fetchWhatsAppHistory,
  type WaChatSummary,
  type WaMessageRecord,
} from '../lib/whatsappClient';

interface WhatsAppChatListProps {
  userId: string;
  /** The owner's own WhatsApp number (digits, from session status). */
  ownerPhone: string | null;
  permissions: Record<string, boolean>;
  onClose: () => void;
  /** Enable a specific WhatsApp permission toggle (persists in settings). */
  onEnablePermission: (key: string) => void;
}

// ── Helpers ──

const AVATAR_COLORS = ['#0a7d6b', '#4b6fb5', '#9b59b6', '#c0843a', '#a14d57', '#3a8d9e', '#7a8b3a'];

function jidDigits(jid: string): string {
  return (jid.split('@')[0] || '').replace(/\D/g, '');
}

function formatPhone(digits: string): string {
  const clean = (digits || '').replace(/\D/g, '');
  return clean ? `+${clean}` : '';
}

function isJidLike(value: string): boolean {
  return /@/.test(value) || /^\+?\d[\d\s-]{4,}$/.test(value.trim());
}

function initialsFor(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed || isJidLike(trimmed)) return '';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function displayName(chat: WaChatSummary): string {
  if (chat.name && !isJidLike(chat.name)) return chat.name;
  const digits = jidDigits(chat.id);
  return digits ? formatPhone(digits) : chat.name || chat.id;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function formatListTime(ms: number): string {
  if (!ms) return '';
  const today = startOfDay(Date.now());
  const day = startOfDay(ms);
  const oneDay = 86_400_000;
  if (day === today) return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (day === today - oneDay) return 'Yesterday';
  return new Date(ms).toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatBubbleTime(ms: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDaySeparator(ms: number): string {
  const today = startOfDay(Date.now());
  const day = startOfDay(ms);
  const oneDay = 86_400_000;
  if (day === today) return 'Today';
  if (day === today - oneDay) return 'Yesterday';
  return new Date(ms).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function Avatar({ name, seed, isGroup, size = 49 }: { name: string; seed: string; isGroup: boolean; size?: number }) {
  const initials = initialsFor(name);
  const bg = avatarColor(seed || name || 'wa');
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 text-white font-semibold select-none"
      style={{ width: size, height: size, background: initials ? bg : '#2a3942', fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials ? initials : isGroup ? <Users style={{ width: size * 0.5, height: size * 0.5 }} /> : <User style={{ width: size * 0.5, height: size * 0.5 }} />}
    </div>
  );
}

// ── Permission / info gate card ──

function GateCard({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex-1 flex items-center justify-center px-8">
      <div className="text-center max-w-xs">
        <div className="w-14 h-14 rounded-full bg-[#202c33] flex items-center justify-center mx-auto mb-4 text-[#8696a0]">
          {icon}
        </div>
        <h3 className="text-[15px] font-semibold text-[#e9edef] mb-1.5">{title}</h3>
        <p className="text-[13px] text-[#8696a0] leading-relaxed mb-4">{body}</p>
        {actionLabel && onAction && (
          <button
            onClick={onAction}
            className="px-4 py-2 rounded-full bg-[#00a884] hover:bg-[#06cf9c] text-[#111b21] text-[13px] font-semibold transition-colors cursor-pointer"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export function WhatsAppChatList({ userId, ownerPhone, permissions, onClose, onEnablePermission }: WhatsAppChatListProps) {
  const [chats, setChats] = useState<WaChatSummary[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [chatsError, setChatsError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [activeChat, setActiveChat] = useState<WaChatSummary | null>(null);
  const [messages, setMessages] = useState<WaMessageRecord[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [msgsError, setMsgsError] = useState<string | null>(null);

  const canReadChats = !!permissions.read_chats;
  const canReadHistory = !!permissions.view_message_history;

  const loadChats = useCallback(async () => {
    if (!canReadChats) return;
    setLoadingChats(true);
    setChatsError(null);
    try {
      const res = await fetchWhatsAppChats(userId, permissions, 40);
      if (res.ok) setChats(res.chats);
      else setChatsError(res.error || 'Failed to load chats');
    } catch (e: any) {
      setChatsError(e?.message || 'Failed to load chats');
    } finally {
      setLoadingChats(false);
    }
  }, [userId, permissions, canReadChats]);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  const openChat = useCallback(async (chat: WaChatSummary) => {
    setActiveChat(chat);
    setMessages([]);
    setMsgsError(null);
    if (!canReadHistory) return;
    setLoadingMsgs(true);
    try {
      const res = await fetchWhatsAppHistory(userId, chat.id, permissions, 50);
      if (res.ok) {
        setMessages([...res.messages].sort((a, b) => a.timestamp - b.timestamp));
      } else {
        setMsgsError(res.error || 'Failed to load conversation');
      }
    } catch (e: any) {
      setMsgsError(e?.message || 'Failed to load conversation');
    } finally {
      setLoadingMsgs(false);
    }
  }, [userId, permissions, canReadHistory]);

  const filteredChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter(c => displayName(c).toLowerCase().includes(q) || jidDigits(c.id).includes(q.replace(/\D/g, '')));
  }, [chats, search]);

  const ownerLabel = ownerPhone ? formatPhone(ownerPhone) : null;

  // ── Conversation thread view ──
  if (activeChat) {
    const name = displayName(activeChat);
    const numberLabel = activeChat.isGroup ? 'Group chat' : formatPhone(jidDigits(activeChat.id));
    let lastDay = 0;
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] flex flex-col h-[100dvh] bg-wa-bg-main"
      >
        <div className="wa-chat-bg opacity-[0.05]" />
        
        {/* Thread header */}
        <header className="shrink-0 flex items-center gap-3 px-2 sm:px-3 h-[60px] bg-wa-bg-header border-b border-black/20 z-10 shadow-sm">
          <button
            onClick={() => setActiveChat(null)}
            className="p-2 -ml-1 rounded-full text-wa-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <Avatar name={name} seed={activeChat.id} isGroup={activeChat.isGroup} size={40} />
          <div className="flex flex-col min-w-0">
            <span className="text-[15px] font-semibold text-wa-text-primary truncate leading-tight">{name}</span>
            <span className="text-[11px] text-wa-green font-bold uppercase tracking-widest mt-0.5">online</span>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-2 z-10">
          {!canReadHistory ? (
            <GateCard
              icon={<Lock className="w-6 h-6" />}
              title="Message history is off"
              body="Enable “View Message History” so Beatrice (and this view) can read past messages in this conversation."
              actionLabel="Enable View Message History"
              onAction={() => onEnablePermission('view_message_history')}
            />
          ) : loadingMsgs ? (
            <div className="flex-1 flex items-center justify-center pt-16">
              <RefreshCw className="w-5 h-5 text-wa-text-secondary animate-spin" />
            </div>
          ) : msgsError ? (
            <GateCard icon={<AlertCircle className="w-6 h-6" />} title="Couldn’t load conversation" body={msgsError} actionLabel="Retry" onAction={() => openChat(activeChat)} />
          ) : messages.length === 0 ? (
            <GateCard
              icon={<MessageSquare className="w-6 h-6" />}
              title="No messages yet"
              body="Recent messages sync from your phone as they arrive."
            />
          ) : (
            messages.map((m) => {
              const day = startOfDay(m.timestamp);
              const showDay = day !== lastDay;
              lastDay = day;
              const senderDigits = jidDigits(m.from);
              return (
                <div key={m.id}>
                  {showDay && (
                    <div className="flex justify-center my-4">
                      <span className="px-3 py-1 rounded-lg bg-wa-bg-sidebar text-wa-text-secondary text-[10px] font-bold uppercase tracking-widest border border-white/5 shadow-sm">
                        {formatDaySeparator(m.timestamp)}
                      </span>
                    </div>
                  )}
                  <div className={`flex ${m.fromMe ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`relative max-w-[85%] sm:max-w-[70%] rounded-xl px-2.5 py-1.5 shadow-sm ${
                        m.fromMe 
                          ? 'bg-wa-bubble-out text-wa-text-primary rounded-tr-none' 
                          : 'bg-wa-bubble-in text-wa-text-primary rounded-tl-none border border-white/[0.02]'
                      }`}
                    >
                      {!m.fromMe && activeChat.isGroup && (
                        <span className="block text-[11px] font-bold mb-0.5" style={{ color: avatarColor(m.from) }}>
                          {senderDigits ? formatPhone(senderDigits) : 'Member'}
                        </span>
                      )}
                      <div className="flex items-end gap-2 flex-wrap">
                        <span className="text-[14px] leading-snug whitespace-pre-wrap break-words">
                          {m.isMedia && !m.body ? '📎 Media' : m.body}
                        </span>
                        <div className="ml-auto flex items-center gap-1 text-[10px] text-white/50 shrink-0 translate-y-0.5">
                          <span>{formatBubbleTime(m.timestamp)}</span>
                          {m.fromMe && <CheckCheck className="w-3.5 h-3.5 text-wa-check-blue" />}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer: read-only notice */}
        <footer className="shrink-0 px-4 py-3 bg-wa-bg-header border-t border-black/20 text-center z-10">
          <p className="text-[11px] text-wa-text-secondary font-medium">
            Read-only preview · Use Beatrice to reply via voice
          </p>
        </footer>
      </motion.div>
    );
  }

  // ── Chat list view ──
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex flex-col h-[100dvh] bg-wa-bg-main"
    >
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between gap-2 px-3 h-[60px] bg-wa-bg-header shadow-md z-10">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onClose}
            className="p-2 -ml-1 rounded-full text-wa-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col min-w-0">
            <span className="text-[18px] font-bold text-wa-text-primary leading-tight">WhatsApp</span>
            {ownerLabel && (
              <span className="text-[11px] text-wa-green font-bold uppercase tracking-wider">{ownerLabel}</span>
            )}
          </div>
        </div>
        <button
          onClick={loadChats}
          disabled={loadingChats || !canReadChats}
          className="p-2 rounded-full text-wa-text-secondary hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-40"
          aria-label="Refresh"
        >
          <RefreshCw className={`w-5 h-5 ${loadingChats ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Search */}
      {canReadChats && (
        <div className="shrink-0 px-3 py-2 bg-wa-bg-main">
          <div className="flex items-center gap-3 bg-wa-bg-header rounded-xl px-4 h-10 border border-white/5 shadow-inner">
            <Search className="w-4 h-4 text-wa-text-secondary shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats"
              className="flex-1 bg-transparent text-[14px] text-wa-text-primary placeholder-wa-text-secondary/50 focus:outline-none min-w-0"
            />
          </div>
        </div>
      )}

      {/* Body */}
      {!canReadChats ? (
        <GateCard
          icon={<Lock className="w-6 h-6" />}
          title="Read Chats is off"
          body="Enable “Read Chats” in settings so Beatrice can access your conversations."
          actionLabel="Enable Permission"
          onAction={() => onEnablePermission('read_chats')}
        />
      ) : loadingChats && chats.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 text-wa-green animate-spin" />
        </div>
      ) : chatsError ? (
        <GateCard icon={<AlertCircle className="w-6 h-6" />} title="Connection error" body={chatsError} actionLabel="Retry" onAction={loadChats} />
      ) : filteredChats.length === 0 ? (
        <GateCard
          icon={<MessageSquare className="w-6 h-6" />}
          title={search ? 'No matches' : 'No chats'}
          body={search ? 'Try searching for something else.' : 'Your recent WhatsApp chats will appear here.'}
        />
      ) : (
        <div className="flex-1 overflow-y-auto">
          {filteredChats.map((chat) => {
            const name = displayName(chat);
            return (
              <button
                key={chat.id}
                onClick={() => openChat(chat)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-wa-bg-header transition-colors text-left cursor-pointer border-b border-white/[0.02]"
              >
                <Avatar name={name} seed={chat.id} isGroup={chat.isGroup} size={54} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[16px] font-semibold text-wa-text-primary truncate">{name}</span>
                    <span className={`text-[12px] font-medium shrink-0 ${chat.unreadCount > 0 ? 'text-wa-green' : 'text-wa-text-secondary'}`}>
                      {formatListTime(chat.timestamp)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                       {chat.isGroup && <Users className="w-3.5 h-3.5 text-wa-text-secondary shrink-0" />}
                       <span className="text-[13px] text-wa-text-secondary truncate leading-relaxed">
                        {chat.lastMessage || ' '}
                      </span>
                    </div>
                    {chat.unreadCount > 0 && (
                      <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-wa-green text-wa-bg-main text-[11px] font-black flex items-center justify-center shadow-lg">
                        {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
          <div className="px-8 py-10 text-center opacity-30">
            <Lock size={14} className="mx-auto mb-2" />
            <p className="text-[10px] uppercase tracking-widest font-bold leading-relaxed">
              End-to-end encrypted · Beatrice Cloud
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
}
