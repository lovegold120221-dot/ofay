import React from 'react';
import { type WaChatSummary } from '../../lib/whatsappClient';

interface ChatListProps {
  chats: WaChatSummary[];
  selectedChatId?: string;
  onSelectChat: (chat: WaChatSummary) => void;
  loading?: boolean;
}

function formatClock(timestamp?: number): string {
  if (!timestamp) return '';
  try {
    const date = new Date(timestamp);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch {
    return '';
  }
}

export const ChatList: React.FC<ChatListProps> = ({ chats, selectedChatId, onSelectChat, loading }) => {
  if (loading && chats.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-wa-text-secondary animate-pulse">Loading conversations...</p>
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-wa-text-secondary italic">No chats found.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      {chats.map((chat) => (
        <button
          key={chat.id}
          onClick={() => onSelectChat(chat)}
          className={`flex w-full items-center gap-3 border-b border-white/[0.03] px-3 py-3 text-left transition-colors ${
            selectedChatId === chat.id ? 'bg-wa-bg-header' : 'hover:bg-wa-bg-header/40'
          }`}
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-wa-bg-header border border-white/10 text-lg font-medium text-wa-text-primary overflow-hidden">
            {chat.name ? (
               <img 
                 src={`https://ui-avatars.com/api/?name=${encodeURIComponent(chat.name)}&background=5630B6&color=F2F2F2`}
                 alt={chat.name}
                 className="w-full h-full object-cover"
               />
            ) : (
              (chat.id || '?').slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[16px] font-normal text-wa-text-primary">
                {chat.name || chat.id}
              </p>
              <span className={`text-[12px] font-normal shrink-0 ${selectedChatId === chat.id ? 'text-wa-text-primary' : 'text-wa-text-secondary'}`}>
                {formatClock(chat.timestamp)}
              </span>
            </div>
            <p className="truncate text-[13px] text-wa-text-secondary mt-0.5">
              {chat.lastMessage || chat.id}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
};
