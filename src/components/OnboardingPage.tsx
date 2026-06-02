import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface OnboardingPageProps {
  onComplete: () => void;
}

const slides = [
  {
    glyph: (
      <svg viewBox="0 0 56 56" fill="none" className="w-full h-full">
        <circle cx="28" cy="28" r="24" stroke="#D6AF93" strokeWidth="1.2" strokeOpacity={0.3} />
        <circle cx="28" cy="28" r="16" stroke="#D6AF93" strokeWidth="1.5" strokeOpacity={0.15} fill="rgba(214,175,147,0.04)" />
        <path d="M22 22c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="#D6AF93" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M20 24c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="#D6AF93" strokeWidth="1.3" strokeLinecap="round" strokeOpacity={0.5} />
        <rect x="25" y="28" width="6" height="14" rx="3" fill="#D6AF93" opacity={0.8} />
        <path d="M22 36c0 3.3 2.7 6 6 6s6-2.7 6-6" stroke="#D6AF93" strokeWidth="1.5" strokeLinecap="round" opacity={0.6} />
        <circle cx="28" cy="24" r="2" fill="#D6AF93" opacity={0.4} />
      </svg>
    ),
    title: 'Voice Intelligence',
    subtitle: 'A premium assistant built for natural, hands-free control.',
  },
  {
    glyph: (
      <svg viewBox="0 0 56 56" fill="none" className="w-full h-full">
        <circle cx="28" cy="28" r="24" stroke="#D6AF93" strokeWidth="1.2" strokeOpacity={0.3} />
        <circle cx="28" cy="28" r="16" stroke="#D6AF93" strokeWidth="1.5" strokeOpacity={0.15} fill="rgba(214,175,147,0.04)" />
        <circle cx="20" cy="22" r="5" stroke="#D6AF93" strokeWidth="1.5" opacity={0.7} />
        <circle cx="36" cy="22" r="5" stroke="#D6AF93" strokeWidth="1.5" opacity={0.7} />
        <circle cx="28" cy="36" r="5" stroke="#D6AF93" strokeWidth="1.5" opacity={0.7} />
        <path d="M24 24l3 9" stroke="#D6AF93" strokeWidth="1.2" opacity={0.5} />
        <path d="M32 24l-3 9" stroke="#D6AF93" strokeWidth="1.2" opacity={0.5} />
      </svg>
    ),
    title: 'Smart Integration',
    subtitle: 'Connect Google Workspace and WhatsApp for secure daily operations.',
  },
  {
    glyph: (
      <svg viewBox="0 0 56 56" fill="none" className="w-full h-full">
        <circle cx="28" cy="28" r="24" stroke="#D6AF93" strokeWidth="1.2" strokeOpacity={0.3} />
        <circle cx="28" cy="28" r="16" stroke="#D6AF93" strokeWidth="1.5" strokeOpacity={0.15} fill="rgba(214,175,147,0.04)" />
        <path d="M20 26l5 5 11-11" stroke="#D6AF93" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
        <path d="M36 20l-8 14-4-4" stroke="#D6AF93" strokeWidth="1.3" strokeLinecap="round" opacity={0.4} />
        <path d="M18 22l10 12" stroke="#D6AF93" strokeWidth="1" strokeLinecap="round" opacity={0.3} />
      </svg>
    ),
    title: 'Voice Control',
    subtitle: 'Speak naturally, get real-time responses, and control your workspace.',
  },
  {
    glyph: (
      <svg viewBox="0 0 56 56" fill="none" className="w-full h-full">
        <circle cx="28" cy="28" r="24" stroke="#D6AF93" strokeWidth="1.2" strokeOpacity={0.3} />
        <circle cx="28" cy="28" r="16" stroke="#D6AF93" strokeWidth="1.5" strokeOpacity={0.15} fill="rgba(214,175,147,0.04)" />
        <rect x="18" y="12" width="20" height="28" rx="4" stroke="#D6AF93" strokeWidth="1.3" opacity={0.6} />
        <rect x="22" y="18" width="12" height="12" rx="2" stroke="#D6AF93" strokeWidth="1" opacity={0.3} fill="rgba(214,175,147,0.06)" />
        <path d="M28 22v4M26 24h4" stroke="#D6AF93" strokeWidth="2" strokeLinecap="round" opacity={0.8} />
        <path d="M24 38l8 2" stroke="#D6AF93" strokeWidth="1.5" strokeLinecap="round" opacity={0.4} />
        <circle cx="28" cy="39" r="1.5" fill="#D6AF93" opacity={0.3} />
      </svg>
    ),
    title: 'Install App',
    subtitle: 'Add Beatrice to your home screen for quick access. Tap Share → Add to Home Screen on iOS, or Install from the browser menu on Android.',
  },
];

export function OnboardingPage({ onComplete }: OnboardingPageProps) {
  const [page, setPage] = useState(0);
  const current = slides[page];
  const isLast = page === slides.length - 1;

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden select-none">
      {/* Ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] sm:w-[600px] h-[400px] sm:h-[600px] bg-[#D6AF93]/[0.06] rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-amber-700/[0.05] rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-[400px] z-10 flex flex-col flex-1">
        {/* Top spacer */}
        <div className="flex-1" />

        {/* Header logo */}
        <div className="flex items-center justify-center gap-3 mb-16">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#D6AF93]/20 to-amber-900/30 p-[1px]">
            <div className="w-full h-full rounded-full bg-[#080808] flex items-center justify-center border border-[#D6AF93]/10 overflow-hidden p-1.5">
              <img src="https://eburon.ai/icon-eburon.svg" alt="" className="w-full h-full object-contain" draggable={false} />
            </div>
          </div>
          <span className="text-sm font-light tracking-[0.15em] text-white/40 uppercase font-['SF_Pro_Display',system-ui,sans-serif]">Beatrice</span>
        </div>

        {/* Card area */}
        <div className="flex-1 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -24, scale: 0.96 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center text-center w-full"
            >
              <div className="w-24 h-24 mb-8">
                {current.glyph}
              </div>
              <h2 className="text-[22px] font-light tracking-wide text-white/85 mb-4 font-['SF_Pro_Display',system-ui,sans-serif]">
                {current.title}
              </h2>
              <p className="text-white/40 text-[15px] leading-relaxed max-w-xs font-['SF_Pro_Text',system-ui,sans-serif] font-normal">
                {current.subtitle}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom area */}
        <div className="flex flex-col items-center gap-8 pb-6">
          {/* Dots */}
          <div className="flex items-center gap-2.5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`rounded-full transition-all duration-500 cursor-pointer ${
                  i === page
                    ? 'w-7 h-[6px] bg-[#D6AF93] shadow-[0_0_12px_rgba(208,167,139,0.3)]'
                    : 'w-[6px] h-[6px] bg-white/15 hover:bg-white/30'
                }`}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>

          {/* Action */}
          {isLast ? (
            <button
              onClick={onComplete}
              className="w-full py-3.5 rounded-2xl bg-white text-[#050505] text-sm font-semibold tracking-wide shadow-lg shadow-white/10 active:scale-[0.97] transition-all duration-200 cursor-pointer hover:bg-white/90 font-['SF_Pro_Text',system-ui,sans-serif]"
            >
              Get Started
            </button>
          ) : (
            <button
              onClick={() => setPage(p => p + 1)}
              className="w-full py-3.5 rounded-2xl bg-[#D6AF93] text-[#050505] text-sm font-semibold tracking-wide shadow-lg shadow-[#D6AF93]/15 active:scale-[0.97] transition-all duration-200 cursor-pointer hover:bg-[#D6AF93]/90 font-['SF_Pro_Text',system-ui,sans-serif]"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
