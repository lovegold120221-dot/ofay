import React from 'react';
import { Laptop, Lock } from 'lucide-react';

export const WelcomeScreen: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-wa-bg-sidebar border-l border-white/5 p-8 text-center select-none">
      <div className="max-w-md space-y-6">
        <div className="flex justify-center mb-8">
           {/* Mock WhatsApp Web Icon */}
           <div className="relative">
              <Laptop className="w-64 h-64 text-wa-text-secondary opacity-10" />
              <div className="absolute inset-0 flex items-center justify-center">
                 <div className="w-24 h-24 bg-wa-green rounded-full flex items-center justify-center shadow-2xl">
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="white">
                       <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.767 5.767 0 1.267.408 2.438 1.103 3.394l-.737 2.73 2.793-.733a5.726 5.726 0 0 0 2.608.628c3.181 0 5.767-2.586 5.767-5.767s-2.586-5.719-5.767-5.719zm0 10.453c-1.16 0-2.235-.333-3.14-.905l-.225-.133-1.644.432.44-1.595-.147-.234a4.636 4.636 0 0 1-.72-2.49c0-2.564 2.083-4.647 4.647-4.647 2.564 0 4.647 2.083 4.647 4.647s-2.083 4.647-4.647 4.647z"/>
                    </svg>
                 </div>
              </div>
           </div>
        </div>
        
        <h1 className="text-[32px] font-light text-wa-text-primary">WhatsApp Web</h1>
        <p className="text-[14px] text-wa-text-secondary leading-relaxed">
          Send and receive messages without keeping your phone online.<br />
          Use WhatsApp on up to 4 linked devices and 1 phone at the same time.
        </p>

        <div className="pt-24 flex items-center justify-center gap-2 text-[13px] text-wa-text-secondary opacity-50 font-medium">
          <Lock className="w-3.5 h-3.5" />
          <span>End-to-end encrypted</span>
        </div>
      </div>
      
      {/* Footer Accent */}
      <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-wa-green/20" />
    </div>
  );
};
