import React from 'react';
import { 
  CircleDashed, 
  MessageSquarePlus, 
  MoreVertical, 
  Search, 
  Filter, 
  UserCircle2 
} from 'lucide-react';

interface SidebarProps {
  children: React.ReactNode;
  userPhone?: string;
  onNewChat?: () => void;
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ children, userPhone, onLogout }) => {
  return (
    <div className="w-full h-full flex flex-col bg-wa-bg-sidebar border-r border-white/5 overflow-hidden">
      {/* Sidebar Header */}
      <header className="h-[60px] flex items-center justify-between px-4 py-3 bg-wa-bg-header shrink-0">
        <div className="flex items-center gap-2">
           <div className="w-10 h-10 rounded-full bg-wa-bg-sidebar flex items-center justify-center text-wa-text-secondary overflow-hidden border border-white/5">
              <UserCircle2 className="w-full h-full" />
           </div>
           {userPhone && (
             <span className="text-xs text-wa-text-secondary font-medium truncate max-w-[100px]">
               {userPhone}
             </span>
           )}
        </div>
        
        <div className="flex items-center gap-3 text-wa-text-secondary">
          <button className="p-2 hover:bg-white/5 rounded-full transition-colors" title="Status">
            <CircleDashed className="w-5 h-5" />
          </button>
          <button className="p-2 hover:bg-white/5 rounded-full transition-colors" title="New Chat">
            <MessageSquarePlus className="w-5 h-5" />
          </button>
          <button 
            className="p-2 hover:bg-white/5 rounded-full transition-colors" 
            title="Menu"
            onClick={onLogout}
          >
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Search & Filter */}
      <div className="px-3 py-2 shrink-0">
        <div className="flex items-center gap-2">
           <div className="flex-1 flex items-center gap-4 px-3 bg-wa-bg-header rounded-lg h-[35px] border border-transparent focus-within:border-wa-green/30 transition-all">
              <Search className="w-4 h-4 text-wa-text-secondary" />
              <input 
                type="text" 
                placeholder="Search or start new chat"
                className="bg-transparent border-none outline-none text-[14px] text-wa-text-primary placeholder:text-wa-text-secondary w-full"
              />
           </div>
           <button className="p-1.5 text-wa-text-secondary hover:bg-white/5 rounded-lg transition-colors">
              <Filter className="w-5 h-5" />
           </button>
        </div>
      </div>

      {/* Chat List Area */}
      {children}
    </div>
  );
};
