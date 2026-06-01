import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface UnifiedTranscriptProps {
  userText: string;
  modelText: string;
  userName: string;
  modelName: string;
}

export function UnifiedTranscript({ userText, modelText, userName, modelName }: UnifiedTranscriptProps) {
  let activeText = '';
  let activeName = '';
  let isModel = false;

  if (modelText) {
    activeText = modelText;
    activeName = modelName;
    isModel = true;
  } else if (userText) {
    activeText = userText;
    activeName = userName;
    isModel = false;
  }

  return (
    <div className="flex flex-col items-center justify-end w-full max-w-xl mx-auto h-full px-4">
      <AnimatePresence mode="wait">
        {activeText && (
          <motion.div
            key={isModel ? 'model' : 'user'}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className={`w-full flex ${isModel ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`relative max-w-[90%] rounded-2xl px-4 py-2.5 shadow-xl ${
                !isModel
                  ? 'bg-wa-bubble-out text-wa-text-primary rounded-tr-none'
                  : 'bg-wa-bubble-in text-wa-text-primary rounded-tl-none border border-white/[0.05]'
              }`}
            >
               <span className={`block text-[10px] font-black uppercase tracking-[0.15em] mb-1 opacity-40 ${!isModel ? 'text-white' : 'text-wa-green'}`}>
                {activeName}
              </span>
              <p className="text-[15px] sm:text-[16px] leading-relaxed font-medium">
                {activeText}
              </p>
              
              {/* WhatsApp Tail */}
              <div className={`absolute top-0 w-2 h-2 ${!isModel ? '-right-1 bg-wa-bubble-out' : '-left-1 bg-wa-bubble-in border-l border-t border-white/[0.05]'} rotate-45 rounded-sm`} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
