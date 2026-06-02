import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MoreVertical, 
  Search, 
  Smile, 
  Paperclip, 
  Mic, 
  SendHorizontal,
  Loader2,
  Video,
  Phone,
  X,
  File,
  Image as ImageIcon,
  Lock,
  PhoneCall
} from 'lucide-react';
import { type WaChatSummary, type WaMessageRecord } from '../../lib/whatsappClient';
import { MessageBubble } from './MessageBubble';

interface ChatAreaProps {
  chat: WaChatSummary;
  messages: WaMessageRecord[];
  loadingMessages?: boolean;
  messageText: string;
  onMessageChange: (text: string) => void;
  onSend: () => void;
  onSendFile: (file: File) => void;
  onCall: (type: 'audio' | 'video' | 'group') => void;
  sending?: boolean;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ 
  chat, 
  messages, 
  loadingMessages, 
  messageText, 
  onMessageChange, 
  onSend,
  onSendFile,
  onCall,
  sending
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAttachments, setShowAttachments] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loadingMessages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSendFile(file);
      setShowAttachments(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-wa-bg-main relative">
      {/* Chat Background Pattern Overlay */}
      <div className="absolute inset-0 wa-chat-bg opacity-[0.06] pointer-events-none" />

      {/* Chat Header */}
      <header className="h-[60px] flex items-center justify-between px-4 py-3 bg-wa-bg-header shrink-0 z-20 border-l border-white/5">
        <div className="flex items-center gap-3 min-w-0">
           <div className="w-10 h-10 rounded-full bg-wa-bg-sidebar border border-white/10 flex items-center justify-center text-wa-text-primary overflow-hidden">
              {chat.name ? (
                 <img 
                   src={`https://ui-avatars.com/api/?name=${encodeURIComponent(chat.name)}&background=5630B6&color=F2F2F2`}
                   alt={chat.name}
                   className="w-full h-full object-cover"
                 />
              ) : (chat.id || '?').slice(0, 1).toUpperCase()}
           </div>
           <div className="min-w-0">
              <h2 className="text-[16px] font-medium text-wa-text-primary truncate leading-tight">
                {chat.name || chat.id}
              </h2>
              <p className="text-[12px] text-wa-text-secondary truncate">
                {loadingMessages ? 'loading messages...' : 'online'}
              </p>
           </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-4 text-wa-text-secondary">
           {chat.isGroup ? (
              <button 
                onClick={() => onCall('group')}
                className="p-2 hover:bg-white/5 rounded-full transition-colors hidden sm:block"
                title="Group Call"
              >
                 <PhoneCall className="w-5 h-5" />
              </button>
           ) : (
             <>
              <button 
                onClick={() => onCall('video')}
                className="p-2 hover:bg-white/5 rounded-full transition-colors hidden sm:block"
                title="Video Call"
              >
                  <Video className="w-5 h-5" />
              </button>
              <button 
                onClick={() => onCall('audio')}
                className="p-2 hover:bg-white/5 rounded-full transition-colors hidden sm:block"
                title="Voice Call"
              >
                  <Phone className="w-5 h-5" />
              </button>
             </>
           )}
           <div className="w-[1px] h-6 bg-white/5 hidden sm:block mx-1" />
           <button className="p-2 hover:bg-white/5 rounded-full transition-colors">
              <Search className="w-5 h-5" />
           </button>
           <button className="p-2 hover:bg-white/5 rounded-full transition-colors">
              <MoreVertical className="w-5 h-5" />
           </button>
        </div>
      </header>

      {/* Message List */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 sm:px-[5%] lg:px-[10%] z-0 custom-scrollbar flex flex-col"
      >
        {/* E2EE Info Card */}
        <div className="mx-auto mb-6 max-w-sm text-center p-3 bg-wa-bg-header rounded-lg border border-white/5 shadow-sm">
           <div className="flex items-center justify-center gap-2 text-wa-green/60 mb-1">
              <Lock size={10} />
              <span className="text-[10px] font-black uppercase tracking-[0.1em]">Encrypted</span>
           </div>
           <p className="text-[12px] text-wa-text-secondary leading-relaxed font-medium">
              Messages are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.
           </p>
        </div>

        {loadingMessages && messages.length === 0 ? (
          <div className="my-auto flex flex-col items-center gap-4 text-wa-text-secondary">
             <Loader2 className="w-8 h-8 animate-spin text-wa-green" />
             <p className="text-sm font-medium uppercase tracking-widest">Decrypting messages</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="my-auto mx-auto max-w-xs text-center p-6 bg-wa-bg-header/40 rounded-lg backdrop-blur-sm border border-white/5 invisible">
             {/* Previous text removed and moved to top card */}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
             {[...messages].reverse().map((msg, idx, arr) => {
                return <MessageBubble key={`${msg.chatId}:${msg.id || idx}`} message={msg} />;
             })}
          </div>
        )}
      </div>

      {/* Chat Footer / Input Area */}
      <footer className="px-4 py-2 bg-wa-bg-header flex items-center gap-3 shrink-0 z-10 border-l border-white/5 relative">
         {/* Attachment Popup */}
         <AnimatePresence>
           {showAttachments && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.9 }}
                className="absolute bottom-[110%] left-4 bg-wa-bg-sidebar border border-white/5 rounded-2xl p-4 shadow-2xl z-30 flex flex-col gap-4"
              >
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-3 text-wa-text-primary hover:text-wa-green transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-beatrice-avatar flex items-center justify-center text-beatrice-text">
                    <File size={20} />
                  </div>
                  <span className="text-sm font-medium">Document</span>
                </button>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-3 text-wa-text-primary hover:text-wa-green transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-wa-green flex items-center justify-center text-wa-bg-main">
                    <ImageIcon size={20} />
                  </div>
                  <span className="text-sm font-medium">Photos & Videos</span>
                </button>
              </motion.div>
           )}
         </AnimatePresence>

         <div className="flex items-center gap-1 text-wa-text-secondary">
            <button className="p-2 hover:bg-white/5 rounded-full transition-colors">
               <Smile className="w-6 h-6" />
            </button>
            <button 
              onClick={() => setShowAttachments(!showAttachments)}
              className={`p-2 hover:bg-white/5 rounded-full transition-colors ${showAttachments ? 'text-wa-green rotate-45' : ''}`}
            >
               <Paperclip className="w-6 h-6" />
            </button>
         </div>

         <input 
           ref={fileInputRef}
           type="file"
           className="hidden"
           onChange={handleFileChange}
         />
         
         <div className="flex-1">
            {isRecording ? (
              <div className="w-full bg-wa-bg-sidebar text-wa-green flex items-center justify-between px-4 py-2 rounded-lg">
                <div className="flex items-center gap-3">
                   <div className="w-2 h-2 rounded-full bg-beatrice-danger animate-pulse" />
                   <span className="text-sm font-bold uppercase tracking-widest">Recording...</span>
                </div>
                <button onClick={() => setIsRecording(false)} className="text-wa-text-secondary hover:text-beatrice-danger">
                   <X size={18} />
                </button>
              </div>
            ) : (
              <input 
                type="text"
                value={messageText}
                onChange={(e) => onMessageChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    onSend();
                  }
                }}
                placeholder="Type a message"
                className="w-full bg-wa-bg-sidebar text-wa-text-primary text-[15px] px-4 py-2 rounded-lg border-none outline-none placeholder:text-wa-text-secondary"
              />
            )}
         </div>

         <div className="text-wa-text-secondary flex items-center justify-center w-10">
            {messageText.trim() || sending || isRecording ? (
               <button 
                 onClick={isRecording ? () => setIsRecording(false) : onSend}
                 disabled={sending}
                 className="p-2 text-wa-green hover:bg-white/5 rounded-full transition-colors disabled:opacity-50"
               >
                  {sending ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <SendHorizontal className="w-6 h-6" />
                  )}
               </button>
            ) : (
               <button 
                 onClick={() => setIsRecording(true)}
                 className="p-2 hover:bg-white/5 rounded-full transition-colors"
               >
                  <Mic className="w-6 h-6" />
               </button>
            )}
         </div>
      </footer>
    </div>
  );
};
