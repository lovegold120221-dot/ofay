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
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const canReadChats = !!permissions.read_chats;
  const canReadHistory = !!permissions.view_message_history;

  const loadChats = useCallback(async () => {
    if (!canReadChats) return;
    setLoadingChats(true);
    setChatsError(null);
    try {
      const res = await fetchWhatsAppChats(userId, permissions, 100);
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
    const interval = setInterval(loadChats, 10000);
    return () => clearInterval(interval);
  }, [loadChats]);

  const openChat = useCallback(async (chat: WaChatSummary) => {
    setActiveChat(chat);
    setMessages([]);
    setMsgsError(null);
    if (!canReadHistory) return;
    setLoadingMsgs(true);
    try {
      const res = await fetchWhatsAppHistory(userId, chat.id, permissions, 100);
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

  const renderThread = (chat: WaChatSummary) => {
    const name = displayName(chat);
    let lastDay = 0;
    return (
      <div className="flex flex-col h-full bg-wa-bg-main relative">
        <div className="wa-chat-bg opacity-[0.05]" />
        
        {/* Thread header */}
        <header className="shrink-0 flex items-center justify-between px-4 h-[60px] bg-wa-bg-header border-b border-black/20 z-10 shadow-sm">
          <div className="flex items-center gap-3">
            {!isDesktop && (
              <button onClick={() => setActiveChat(null)} className="p-2 -ml-2 rounded-full text-wa-text-secondary hover:bg-white/5 transition-colors cursor-pointer">
                <ArrowLeft className="w-6 h-6" />
              </button>
            )}
            <Avatar name={name} seed={chat.id} isGroup={chat.isGroup} size={40} />
            <div className="flex flex-col min-w-0">
              <span className="text-[15px] font-semibold text-wa-text-primary truncate leading-tight">{name}</span>
              <span className="text-[11px] text-wa-green font-bold uppercase tracking-widest mt-0.5">online</span>
            </div>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-2 z-10">
          {!canReadHistory ? (
            <GateCard icon={<Lock className="w-6 h-6" />} title="History is off" body="Enable View Message History in settings." onAction={() => onEnablePermission('view_message_history')} />
          ) : loadingMsgs ? (
            <div className="flex-1 flex items-center justify-center pt-16">
              <RefreshCw className="w-6 h-6 text-wa-green animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12 text-wa-text-secondary">No recent messages synced.</div>
          ) : (
            messages.map((m) => {
              const day = startOfDay(m.timestamp);
              const showDay = day !== lastDay;
              lastDay = day;
              return (
                <div key={m.id}>
                  {showDay && (
                    <div className="flex justify-center my-4">
                      <span className="px-3 py-1 rounded-lg bg-wa-bg-sidebar text-wa-text-secondary text-[10px] font-black uppercase tracking-widest border border-white/5 shadow-sm">
                        {formatDaySeparator(m.timestamp)}
                      </span>
                    </div>
                  )}
                  <div className={`flex ${m.fromMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`relative max-w-[85%] sm:max-w-[65%] rounded-xl px-2.5 py-1.5 shadow-sm ${m.fromMe ? 'bg-wa-bubble-out text-wa-text-primary rounded-tr-none' : 'bg-wa-bubble-in text-wa-text-primary rounded-tl-none border border-white/[0.02]'}`}>
                      <div className="flex items-end gap-3 flex-wrap">
                        <span className="text-[14.5px] leading-relaxed whitespace-pre-wrap break-words">{m.body}</span>
                        <div className="ml-auto flex items-center gap-1 text-[10px] text-white/50 shrink-0 translate-y-0.5">
                          <span>{formatBubbleTime(m.timestamp)}</span>
                          {m.fromMe && <CheckCheck className="w-3.5 h-3.5 text-wa-check-blue" />}
                        </div>
                      </div>
                      <div className={`absolute top-0 w-2 h-2 ${m.fromMe ? '-right-1 bg-wa-bubble-out' : '-left-1 bg-wa-bubble-in border-l border-t border-white/[0.02]'} rotate-45 rounded-sm`} />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  const renderSidebar = () => (
    <div className={`flex flex-col h-full bg-wa-bg-sidebar border-r border-white/5 ${isDesktop ? 'w-[400px]' : 'w-full'}`}>
      <header className="shrink-0 flex items-center justify-between px-4 h-[60px] bg-wa-bg-header shadow-md z-10">
        <div className="flex items-center gap-3 min-w-0">
          {!isDesktop && (
            <button onClick={onClose} className="p-2 -ml-2 rounded-full text-wa-text-secondary hover:bg-white/5 transition-colors cursor-pointer">
              <ArrowLeft className="w-6 h-6" />
            </button>
          )}
          <div className="flex flex-col min-w-0">
            <span className="text-[19px] font-bold text-wa-text-primary leading-tight">Chats</span>
            {ownerLabel && <span className="text-[11px] text-wa-green font-black uppercase tracking-widest">{ownerLabel}</span>}
          </div>
        </div>
        <button onClick={loadChats} disabled={loadingChats} className="p-2 rounded-full text-wa-text-secondary hover:bg-white/5 transition-colors disabled:opacity-40">
          <RefreshCw className={`w-5 h-5 ${loadingChats ? 'animate-spin' : ''}`} />
        </button>
      </header>

      <div className="shrink-0 px-3 py-2 bg-wa-bg-sidebar border-b border-white/[0.03]">
        <div className="flex items-center gap-3 bg-wa-bg-header rounded-xl px-4 h-9 border border-white/5 shadow-inner">
          <Search className="w-4 h-4 text-wa-text-secondary shrink-0" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats" className="flex-1 bg-transparent text-[14px] text-wa-text-primary placeholder-wa-text-secondary/50 focus:outline-none min-w-0" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!canReadChats ? (
          <GateCard icon={<Lock size={32} />} title="Read Chats is off" body="Enable Read Chats to sync your WhatsApp." onAction={() => onEnablePermission('read_chats')} />
        ) : filteredChats.length === 0 ? (
          <div className="p-8 text-center text-wa-text-secondary text-sm italic">No conversations found.</div>
        ) : (
          filteredChats.map((chat) => {
            const name = displayName(chat);
            const isActive = activeChat?.id === chat.id;
            return (
              <button key={chat.id} onClick={() => openChat(chat)} className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left cursor-pointer border-b border-white/[0.02] ${isActive ? 'bg-wa-bg-header' : 'hover:bg-white/[0.03]'}`}>
                <Avatar name={name} seed={chat.id} isGroup={chat.isGroup} size={49} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[16px] font-semibold text-wa-text-primary truncate">{name}</span>
                    <span className={`text-[11px] font-medium shrink-0 ${chat.unreadCount > 0 ? 'text-wa-green' : 'text-wa-text-secondary'}`}>
                      {formatListTime(chat.timestamp)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="text-[13px] text-wa-text-secondary truncate leading-relaxed flex-1">
                      {chat.isGroup && <Users className="w-3 h-3 inline mr-1 -mt-0.5" />}
                      {chat.lastMessage || ' '}
                    </span>
                    {chat.unreadCount > 0 && (
                      <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-wa-green text-wa-bg-main text-[11px] font-black flex items-center justify-center shadow-lg">
                        {chat.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] flex bg-wa-bg-main overflow-hidden">
      {!isDesktop ? (
        activeChat ? renderThread(activeChat) : renderSidebar()
      ) : (
        <>
          {renderSidebar()}
          <div className="flex-1 bg-wa-bg-main relative border-l border-white/5">
            {activeChat ? renderThread(activeChat) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-12 relative">
                <div className="wa-chat-bg opacity-[0.03]" />
                <div className="w-24 h-24 rounded-full bg-wa-bg-sidebar border border-white/5 flex items-center justify-center mb-6 text-wa-green/20">
                   <MessageSquare size={48} />
                </div>
                <h2 className="text-2xl font-semibold text-wa-text-primary mb-2">Beatrice WhatsApp</h2>
                <p className="text-sm text-wa-text-secondary max-w-sm leading-relaxed">Select a chat to view synchronized messages from your phone. Use Beatrice via voice to reply instantly.</p>
                <div className="absolute bottom-10 text-[10px] uppercase tracking-widest text-wa-text-secondary/30 font-black flex items-center gap-2">
                  <Lock size={12} /> End-to-end encrypted · Beatrice Cloud
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}
