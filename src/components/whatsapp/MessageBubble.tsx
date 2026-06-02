import React from 'react';
import { Check, CheckCheck } from 'lucide-react';
import { type WaMessageRecord } from '../../lib/whatsappClient';

interface MessageBubbleProps {
  message: WaMessageRecord;
}

function formatClock(timestamp?: number): string {
  if (!timestamp) return '';
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isMe = message.fromMe;
  const isImage = message.body?.match(/\.(jpeg|jpg|gif|png|webp)/i);

  return (
    <div className={`flex w-full mb-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`relative max-w-[85%] sm:max-w-[65%] rounded-lg px-2 py-1.5 shadow-sm ${
          isMe
            ? 'bg-wa-bubble-out text-wa-text-primary rounded-tr-none'
            : 'bg-wa-bubble-in text-wa-text-primary rounded-tl-none border border-white/[0.02]'
        }`}
      >
        {isImage ? (
          <div className="mb-1 rounded overflow-hidden max-h-[300px]">
             <img src={message.body} alt="Media" className="w-full h-full object-cover" />
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words text-[14.2px] leading-[1.4] pr-10">
            {message.body}
          </p>
        )}
        
        <div className="absolute bottom-1 right-2 flex items-center gap-1 text-[10px] text-white/50 font-normal select-none">
          <span>{formatClock(message.timestamp)}</span>
          {isMe && (
            <CheckCheck className="w-3.5 h-3.5 text-wa-check-blue" />
          )}
        </div>

        {/* Tail */}
        <div 
          className={`absolute top-0 w-3 h-3 ${
            isMe 
              ? '-right-1.5 bg-wa-bubble-out clip-tail-out' 
              : '-left-1.5 bg-wa-bubble-in clip-tail-in'
          }`} 
          style={{
            clipPath: isMe 
              ? 'polygon(0 0, 0% 100%, 100% 0)' 
              : 'polygon(100% 0, 100% 100%, 0 0)'
          }}
        />
      </div>
    </div>
  );
};
