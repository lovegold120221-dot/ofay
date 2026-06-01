import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, ArrowDown, MessageSquare, ChevronLeft, Menu, Paperclip, CheckCheck } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  sessionId?: string;
  timestamp: any;
  attachmentUrl?: string;
  attachmentName?: string;
}

interface SessionSummary {
  id: string;
  startTime: Date;
  endTime: Date;
  preview: string;
  count: number;
}

interface ChatPageProps {
  messages: ChatMessage[];
  sessions: SessionSummary[];
  selectedSessionId: string | null;
  onSelectSession: (id: string | null) => void;
  chatInput: string;
  setChatInput: (val: string) => void;
  onSend: (e: React.FormEvent) => void;
  onClose: () => void;
  isActive: boolean;
  personaName: string;
  userName: string;
  onFileAttach?: (file: File) => void;
}

const formatTime = (ts: any): string => {
  if (!ts) return '';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const formatSessionDate = (d: Date): string => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (target.getTime() === today.getTime()) return 'Today';
  if (target.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

export function ChatPage({
  messages,
  sessions,
  selectedSessionId,
  onSelectSession,
  chatInput,
  setChatInput,
  onSend,
  onClose,
  isActive,
  personaName,
  userName,
  onFileAttach,
}: ChatPageProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const prevMsgCount = useRef(messages.length);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useRef(typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return undefined;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 100);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (messages.length > prevMsgCount.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMsgCount.current = messages.length;
  }, [messages.length]);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const currentSession = sessions.find(s => s.id === selectedSessionId);

  const handleFileAttach = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onFileAttach) {
      onFileAttach(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-wa-bg-main flex flex-col h-[100dvh] text-wa-text-primary"
    >
      <div className="wa-chat-bg opacity-[0.06]" />

      {/* ── Header ── */}
      <header className="sticky top-0 w-full bg-wa-bg-header border-b border-black/20 px-2 sm:px-3 py-2 sm:py-2.5 flex items-center justify-between z-20 shrink-0 min-h-[48px] sm:min-h-[60px] shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 -ml-1 rounded-full text-wa-text-secondary hover:bg-white/5 transition-all"
            aria-label="Back"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          
          <div className="w-10 h-10 rounded-full bg-wa-bg-sidebar border border-white/5 flex items-center justify-center shrink-0 overflow-hidden">
            <span className="text-white/70 text-sm font-semibold">{personaName.charAt(0)}</span>
          </div>

          <div className="flex flex-col min-w-0">
            <h1 className="text-[15px] font-semibold text-wa-text-primary truncate leading-tight">{personaName}</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[11px] text-wa-green font-bold uppercase tracking-wider">
                {isActive ? 'online' : 'offline'}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setSidebarOpen(prev => !prev)}
          className="p-2 -mr-1 rounded-full text-wa-text-secondary hover:bg-white/5 transition-all relative"
          aria-label="History"
        >
          <Menu className="w-5 h-5" />
          {sessions.length > 0 && !sidebarOpen && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-wa-green border border-wa-bg-header" />
          )}
        </button>
      </header>

      {/* ── Main Area ── */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* ── Sessions Sidebar ── */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              {isMobile.current && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/60 z-30 md:hidden"
                  onClick={() => setSidebarOpen(false)}
                />
              )}
              <motion.aside
                initial={isMobile.current ? { x: -300, opacity: 0 } : { width: 0, opacity: 0 }}
                animate={isMobile.current ? { x: 0, opacity: 1 } : { width: 280, opacity: 1 }}
                exit={isMobile.current ? { x: -300, opacity: 0 } : { width: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className={
                  isMobile.current
                    ? 'fixed left-0 top-0 bottom-0 w-[300px] z-40 bg-wa-bg-sidebar border-r border-white/5 flex flex-col shadow-2xl'
                    : 'border-r border-white/5 overflow-hidden shrink-0 bg-black/10 flex flex-col h-full'
                }
              >
                <div className="h-full flex flex-col">
                  <div className="px-4 py-4 border-b border-white/5 flex items-center justify-between shrink-0 bg-wa-bg-header">
                    <h2 className="text-sm font-bold text-wa-green tracking-widest uppercase">History</h2>
                    {isMobile.current && (
                      <button
                        onClick={() => setSidebarOpen(false)}
                        className="p-1 rounded-full text-wa-text-secondary hover:bg-white/5 transition-all"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto py-2 space-y-px">
                    {sessions.length === 0 && (
                      <div className="text-center py-12 px-6">
                        <p className="text-sm text-wa-text-secondary">No conversation history yet</p>
                      </div>
                    )}
                    {sessions.map(session => (
                      <button
                        key={session.id}
                        onClick={() => {
                          onSelectSession(session.id);
                          if (isMobile.current) setSidebarOpen(false);
                        }}
                        className={`w-full text-left px-4 py-3.5 border-b border-white/[0.02] transition-colors ${
                          session.id === selectedSessionId
                            ? 'bg-wa-bg-header'
                            : 'hover:bg-white/[0.03]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[13px] font-semibold ${
                            session.id === selectedSessionId ? 'text-wa-green' : 'text-wa-text-primary'
                          }`}>
                            {formatSessionDate(session.startTime)}
                          </span>
                          <span className="text-[11px] text-wa-text-secondary font-medium">
                            {session.count} messages
                          </span>
                        </div>
                        <p className="text-[13px] text-wa-text-secondary truncate leading-relaxed">
                          {session.preview || 'New conversation'}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* ── Messages Area ── */}
        <div className="flex-1 flex flex-col h-full min-w-0 relative">
          
          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-2 scroll-smooth"
          >
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center px-10">
                <div className="w-16 h-16 rounded-full bg-wa-bg-sidebar border border-white/5 flex items-center justify-center mb-4 text-wa-text-secondary/30">
                  <MessageSquare size={32} />
                </div>
                <p className="text-wa-text-secondary text-sm">Select a session or start a new one to see messages.</p>
              </div>
            )}

            <AnimatePresence>
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.15 }}
                  className={`flex mb-1 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`relative max-w-[85%] sm:max-w-[70%] rounded-xl px-2.5 py-1.5 shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-wa-bubble-out text-wa-text-primary rounded-tr-none'
                        : 'bg-wa-bubble-in text-wa-text-primary rounded-tl-none border border-white/[0.02]'
                    }`}
                  >
                    <div className="text-[14px] leading-relaxed break-words whitespace-pre-wrap">
                      {msg.role === 'model' ? (
                        <div className="prose prose-invert prose-sm max-w-none prose-p:my-0 prose-pre:bg-black/20">
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                        </div>
                      ) : (
                        msg.text
                      )}
                    </div>
                    
                    <div className="mt-1 flex items-center justify-end gap-1.5">
                      <span className="text-[10px] text-white/50 font-medium">
                        {formatTime(msg.timestamp)}
                      </span>
                      {msg.role === 'user' && (
                        <span className="text-wa-check-blue">
                          <CheckCheck size={14} />
                        </span>
                      )}
                    </div>

                    {msg.attachmentUrl && (
                      <div className="mt-2 pt-2 border-t border-white/5">
                        {msg.attachmentUrl.match(/\.(jpeg|jpg|gif|png|webp)/i) ? (
                          <img
                            src={msg.attachmentUrl}
                            alt="Attachment"
                            className="rounded-lg max-w-full h-auto cursor-pointer border border-white/10"
                            onClick={() => window.open(msg.attachmentUrl, '_blank')}
                          />
                        ) : (
                          <button
                            onClick={() => window.open(msg.attachmentUrl, '_blank')}
                            className="flex items-center gap-2 text-[12px] text-wa-green hover:underline bg-black/20 p-2 rounded-lg w-full"
                          >
                            <Paperclip size={14} />
                            <span className="truncate">{msg.attachmentName || 'Attachment'}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={bottomRef} />
          </div>

          {/* Scroll to bottom */}
          <AnimatePresence>
            {showScrollBtn && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                onClick={scrollToBottom}
                className="absolute bottom-24 right-4 w-9 h-9 rounded-full bg-wa-bg-header border border-white/10 text-wa-text-secondary flex items-center justify-center shadow-lg z-10 hover:text-wa-text-primary"
              >
                <ArrowDown size={18} />
              </motion.button>
            )}
          </AnimatePresence>

          {/* ── Input footer ── */}
          <footer className="shrink-0 w-full bg-wa-bg-header/95 backdrop-blur-md px-3 py-3 z-10 border-t border-black/20">
            <form onSubmit={onSend} className="flex gap-2 items-center max-w-4xl mx-auto">
              <div className="flex-1 flex gap-2 items-center bg-wa-bg-sidebar rounded-full px-3 py-1.5 border border-white/[0.05]">
                <button
                  type="button"
                  onClick={handleFileAttach}
                  className="p-1.5 text-wa-text-secondary hover:text-wa-text-primary transition-colors"
                >
                  <Paperclip size={20} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <input
                  ref={inputRef}
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={isActive ? "Message..." : "Start session to chat"}
                  disabled={!isActive}
                  className="flex-1 bg-transparent text-[15px] text-wa-text-primary outline-none py-1 placeholder-wa-text-secondary/50"
                />
              </div>
              <button
                type="submit"
                disabled={!isActive || !chatInput.trim()}
                className="w-11 h-11 rounded-full bg-wa-green text-wa-bg-main flex items-center justify-center shadow-md active:scale-95 disabled:opacity-40 transition-all"
              >
                <Send size={20} strokeWidth={2.5} />
              </button>
            </form>
          </footer>
        </div>
      </div>
    </motion.div>
  );
}