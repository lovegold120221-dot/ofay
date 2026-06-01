import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, X } from 'lucide-react';

export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed or in standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                        (window.navigator as any).standalone || 
                        document.referrer.includes('android-app://');
    
    setIsInstalled(isStandalone);

    const handleBeforeInstallPrompt = (e: any) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      // Show the banner only if not already installed
      if (!isStandalone) {
        // Show after a short delay for better UX
        const timer = setTimeout(() => setIsVisible(true), 2000);
        return () => clearTimeout(timer);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
      setIsVisible(false);
    }
    
    // We've used the prompt, and can't use it again
    setDeferredPrompt(null);
  };

  if (isInstalled || !isVisible) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-6 left-6 right-6 z-[200] md:left-auto md:w-96"
        >
          <div className="relative overflow-hidden rounded-2xl bg-[#121212]/90 backdrop-blur-xl border border-amber-500/20 shadow-2xl shadow-amber-900/20 p-5">
            {/* Background Glow */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
            
            <div className="relative flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 p-0.5 shadow-lg shadow-amber-900/40">
                <div className="w-full h-full rounded-[10px] bg-[#121212] flex items-center justify-center overflow-hidden">
                  <img src="/icon-eburon.svg" alt="Beatrice" className="w-8 h-8 object-contain" />
                </div>
              </div>
              
              <div className="flex-grow">
                <h3 className="text-white font-semibold text-sm">Install Beatrice</h3>
                <p className="text-amber-500/60 text-xs mt-0.5 leading-relaxed">
                  Eburon AI Voice Intelligence
                </p>
              </div>

              <button 
                onClick={() => setIsVisible(false)}
                className="absolute -top-2 -right-2 p-2 text-white/20 hover:text-white/60 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={handleInstallClick}
                className="flex-grow flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl transition-all active:scale-95 shadow-lg shadow-amber-900/20"
              >
                <Download size={14} />
                Install App
              </button>
              <button
                onClick={() => setIsVisible(false)}
                className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white/60 text-xs font-medium rounded-xl transition-colors"
              >
                Later
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
