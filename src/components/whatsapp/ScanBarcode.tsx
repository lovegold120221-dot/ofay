import React from 'react';
import { Loader2, RefreshCw, Smartphone } from 'lucide-react';

interface ScanBarcodeProps {
  qrCode?: string;
  pairingCode?: string;
  status: string;
  onRefresh: () => void;
  loading: boolean;
}

export const ScanBarcode: React.FC<ScanBarcodeProps> = ({ qrCode, pairingCode, status, onRefresh, loading }) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-white p-6 sm:p-12 text-[#41525d]">
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        <div className="space-y-8">
           <h1 className="text-[28px] font-light leading-tight">
             {pairingCode ? 'Enter this code on your phone:' : 'To use WhatsApp on your computer:'}
           </h1>
           
           {pairingCode ? (
             <div className="space-y-6">
                <ol className="space-y-4 list-decimal list-inside text-[18px] leading-relaxed">
                   <li>Open WhatsApp on your phone</li>
                   <li>Tap <strong>Menu</strong> or <strong>Settings</strong></li>
                   <li>Tap <strong>Linked Devices</strong></li>
                   <li>Tap <strong>Link with phone number instead</strong></li>
                </ol>
                <div className="bg-[#f0f2f5] p-6 rounded-xl border border-black/5 flex items-center justify-center gap-2 select-all shadow-inner">
                   {pairingCode.split('').map((char, i) => (
                      <span key={i} className={`text-3xl font-black font-mono tracking-tighter ${char === '-' ? 'text-gray-300 mx-1' : 'text-wa-green'}`}>
                         {char}
                      </span>
                   ))}
                </div>
             </div>
           ) : (
             <ol className="space-y-4 list-decimal list-inside text-[18px] leading-relaxed">
                <li>Open WhatsApp on your phone</li>
                <li>Tap <strong>Menu</strong> or <strong>Settings</strong> and select <strong>Linked Devices</strong></li>
                <li>Tap on <strong>Link a Device</strong></li>
                <li>Point your phone to this screen to capture the code</li>
             </ol>
           )}
           
           <div className="pt-4 flex items-center gap-4 text-wa-green font-medium cursor-pointer hover:underline">
              <span>Need help to get started?</span>
           </div>
        </div>

        <div className="flex flex-col items-center gap-6">
           <div className="relative p-4 bg-white border border-black/5 shadow-sm rounded-sm">
              {loading && !qrCode && !pairingCode ? (
                 <div className="w-64 h-64 flex items-center justify-center bg-gray-50">
                    <Loader2 className="w-12 h-12 animate-spin text-wa-green" />
                 </div>
              ) : pairingCode ? (
                 <div className="w-64 h-64 flex flex-col items-center justify-center bg-wa-green/5 gap-4 text-center px-4 border-2 border-dashed border-wa-green/20 rounded-lg">
                    <Smartphone className="w-16 h-16 text-wa-green/20" />
                    <p className="text-sm font-bold text-wa-green uppercase tracking-widest">Waiting for Phone</p>
                 </div>
              ) : qrCode ? (
                 <img 
                   src={qrCode} 
                   alt="WhatsApp QR Code" 
                   className="w-64 h-64 block"
                 />
              ) : (
                 <div className="w-64 h-64 flex flex-col items-center justify-center bg-gray-50 gap-4 text-center px-4">
                    <p className="text-sm">Failed to load pairing data. Session might be initializing.</p>
                    <button 
                      onClick={onRefresh}
                      className="p-2 rounded-full bg-wa-green text-white hover:brightness-110"
                    >
                      <RefreshCw className="w-5 h-5" />
                    </button>
                 </div>
              )}
              
              {/* Overlay for initial loading only if we have no pairing data yet */}
              {status === 'init' && !qrCode && !pairingCode && (
                 <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-20">
                    <Loader2 className="w-10 h-10 animate-spin text-wa-green" />
                 </div>
              )}
           </div>

           <div className="flex items-center gap-3">
              <input type="checkbox" id="keep-signed-in" className="w-4 h-4 accent-wa-green" defaultChecked />
              <label htmlFor="keep-signed-in" className="text-[14px]">Keep me signed in</label>
           </div>
        </div>
      </div>
      
      <div className="mt-20 flex flex-col items-center gap-4 max-w-lg text-center">
         <div className="flex items-center gap-2 text-wa-green uppercase text-[12px] font-bold tracking-widest">
            <Smartphone className="w-4 h-4" />
            <span>Link with phone number</span>
         </div>
         <p className="text-[14px] opacity-60">
            Voxx-Zero WhatsApp Bridge uses secure end-to-end encryption. 
            Your messages are never stored on our servers.
         </p>
      </div>
    </div>
  );
};
