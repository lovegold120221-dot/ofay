import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import { MessageCircle, Send, MessageSquare, User, UserPlus, Users, MessageSquareText, Clock, Phone, Video } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { startWhatsAppPairing, getWhatsAppStatus, disconnectWhatsApp } from '../lib/whatsappClient';
import { WhatsAppChatList } from './WhatsAppChatList';

interface WhatsAppSettingsProps {
  userId: string;
  waPermissions: Record<string, boolean>;
  onTogglePermission: (key: string) => void;
}

export function WhatsAppSettings({ userId, waPermissions, onTogglePermission }: WhatsAppSettingsProps) {
  const [waStatus, setWaStatus] = useState<string>('not_found');
  const [waQrCode, setWaQrCode] = useState<string | null>(null);
  const [waPhone, setWaPhone] = useState<string | null>(null);
  const [waPairing, setWaPairing] = useState(false);
  const [pairingMethod, setPairingMethod] = useState<'qr' | 'phone'>('qr');
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [waPairingCode, setWaPairingCode] = useState<string | null>(null);
  const waPollRef = useRef<any>(null);

  useEffect(() => {
    loadStatus();
    return () => {
      if (waPollRef.current) clearInterval(waPollRef.current);
    };
  }, []);

  const startPolling = () => {
    if (waPollRef.current) clearInterval(waPollRef.current);
    waPollRef.current = setInterval(async () => {
      try {
        const s = await getWhatsAppStatus(userId);
        setWaStatus(s.status);
        if (s.qrCode) setWaQrCode(s.qrCode);
        if (s.phone) setWaPhone(s.phone);
        if (s.pairingCode) {
          setWaPairingCode(s.pairingCode);
          setPairingMethod('phone');
        }
        if (s.status === 'paired' || s.status === 'disconnected' || s.error) {
          if (s.status === 'paired') {
            await supabase.from('user_settings').upsert({ user_id: userId, whatsapp_paired: true, whatsapp_phone: s.phone || null, updated_at: new Date().toISOString() });
          }
          if (waPollRef.current) clearInterval(waPollRef.current);
          waPollRef.current = null;
          setWaPairing(false);
        }
      } catch {
        if (waPollRef.current) clearInterval(waPollRef.current);
        waPollRef.current = null;
        setWaPairing(false);
      }
    }, 1500);
  };

  const loadStatus = async () => {
    try {
      const s = await getWhatsAppStatus(userId);
      setWaStatus(s.status);
      if (s.qrCode) setWaQrCode(s.qrCode);
      if (s.phone) setWaPhone(s.phone);
      if (s.pairingCode) {
        setWaPairingCode(s.pairingCode);
        setPairingMethod('phone');
      } else {
        if (s.status === 'qr_ready' || s.status === 'init') {
          setPairingMethod('qr');
        }
      }

      if (s.status === 'qr_ready' || s.status === 'init') {
        setWaPairing(true);
        startPolling();
      }
    } catch (e) {
      console.error('Failed to load whatsapp settings:', e);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-['SF_Pro_Text',system-ui,sans-serif] font-bold tracking-[0.2em] uppercase text-beatrice-secondary/70 mb-3 px-1">WhatsApp Integration</h2>
      <div className="bg-beatrice-surface/35 border border-white/[0.06] rounded-3xl shadow-[0_8px_32px_rgba(2,6,6,0.45)] overflow-hidden">
        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 bg-beatrice-deep/45 px-3 py-1.5 rounded-full border border-white/[0.06]">
              <div className={`w-1.5 h-1.5 rounded-full ${waStatus === 'paired' ? 'bg-beatrice-live shadow-[0_0_8px_rgba(8,185,148,0.6)] animate-pulse' : waStatus === 'qr_ready' || waStatus === 'init' ? 'bg-beatrice-glow shadow-[0_0_8px_rgba(214,175,147,0.45)] animate-pulse' : 'bg-beatrice-muted/70'}`} />
              <span className={`text-[11px] font-bold uppercase tracking-wider ${waStatus === 'paired' ? 'text-beatrice-live' : waStatus === 'qr_ready' || waStatus === 'init' ? 'text-beatrice-glow' : 'text-beatrice-muted'}`}>
                {waStatus === 'paired' ? `Connected${waPhone ? ` (${waPhone})` : ''}` : waStatus === 'qr_ready' ? (waPairingCode ? 'OTP Verification' : 'Scan QR Code') : waStatus === 'init' ? 'Initializing...' : 'Disconnected'}
              </span>
            </div>
            {waStatus === 'paired' ? (
              <button
                onClick={async () => {
                  await disconnectWhatsApp(userId);
                  setWaStatus('not_found');
                  setWaPhone(null);
                  setWaQrCode(null);
                  setWaPairingCode(null);
                  await supabase.from('user_settings').upsert({ user_id: userId, whatsapp_paired: false, whatsapp_phone: null, whatsapp_permissions: waPermissions, updated_at: new Date().toISOString() });
                }}
                className="px-4 py-2 bg-beatrice-danger/10 hover:bg-beatrice-danger/20 active:scale-95 rounded-xl text-xs font-['SF_Pro_Text',system-ui,sans-serif] font-semibold text-beatrice-danger border border-beatrice-danger/20 transition-all duration-200 cursor-pointer"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={async () => {
                  if (pairingMethod === 'phone' && !phoneInput.trim()) {
                    alert('Please enter your phone number with country code first (e.g. +31612345678).');
                    return;
                  }
                  setWaPairing(true);
                  // Reset state to avoid stale data
                  setWaStatus('init');
                  setWaPairingCode(null);
                  setWaQrCode(null);
                  
                  try {
                    await startWhatsAppPairing(userId, pairingMethod === 'phone' ? phoneInput : undefined);
                    startPolling();
                  } catch (e: any) {
                    setWaPairing(false);
                    if (waPollRef.current) clearInterval(waPollRef.current);
                  }
                }}
                disabled={waPairing}
                className="px-4 py-2 bg-beatrice-live hover:bg-beatrice-teal active:scale-95 disabled:opacity-40 rounded-xl text-xs font-['SF_Pro_Text',system-ui,sans-serif] font-bold text-beatrice-deep shadow-[0_4px_16px_rgba(8,185,148,0.18)] hover:shadow-[0_4px_20px_rgba(8,185,148,0.28)] transition-all duration-200 cursor-pointer"
              >
                {waPairing ? (pairingMethod === 'phone' ? 'Sending OTP...' : 'Generating...') : (pairingMethod === 'phone' ? 'Send OTP' : 'Generate QR')}
              </button>
            )}
          </div>

          {waStatus !== 'paired' && (
            <div className="flex flex-col gap-3 pt-3 border-t border-white/[0.06]">
              <label className="text-[10px] uppercase tracking-[0.15em] text-beatrice-muted font-bold px-1">Pairing Option</label>
              <div className="grid grid-cols-2 gap-1.5 bg-beatrice-deep/45 p-1 rounded-2xl border border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setPairingMethod('qr')}
                  disabled={waPairing}
                  className={`py-2 rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer ${pairingMethod === 'qr' ? 'bg-beatrice-surface text-beatrice-teal border border-white/[0.06] shadow-sm' : 'text-beatrice-muted hover:text-beatrice-secondary border border-transparent'} disabled:opacity-50`}
                >
                  Scan QR Code
                </button>
                <button
                  type="button"
                  onClick={() => setPairingMethod('phone')}
                  disabled={waPairing}
                  className={`py-2 rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer ${pairingMethod === 'phone' ? 'bg-beatrice-surface text-beatrice-teal border border-white/[0.06] shadow-sm' : 'text-beatrice-muted hover:text-beatrice-secondary border border-transparent'} disabled:opacity-50`}
                >
                  Use Phone Number
                </button>
              </div>
              
              {pairingMethod === 'phone' && (
                <div className="flex flex-col gap-2 mt-1 bg-beatrice-deep/45 p-4 rounded-2xl border border-white/[0.06]">
                  <label htmlFor="wa-phone-input" className="text-[11px] uppercase tracking-wider text-beatrice-secondary font-semibold">WhatsApp Phone Number</label>
                  <input
                    id="wa-phone-input"
                    type="text"
                    value={phoneInput}
                    disabled={waPairing}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="e.g. +31 6 12345678"
                    className="bg-beatrice-deep/70 border border-white/[0.06] rounded-xl px-3.5 py-2.5 text-xs text-beatrice-text placeholder-beatrice-muted focus:outline-none focus:border-beatrice-teal/50 focus:ring-1 focus:ring-beatrice-teal/20 transition-all duration-300 disabled:opacity-50"
                  />
                  <p className="text-[11px] text-beatrice-muted leading-relaxed font-medium">
                    Enter the phone number registered on your WhatsApp app, including your country code (e.g. 31612345678).
                  </p>
                </div>
              )}
            </div>
          )}

          {waPairing && waStatus === 'init' && (
            <div className="flex flex-col items-center pt-4 border-t border-white/[0.06]">
              <div className="flex items-center gap-2 mb-2">
                <svg className="animate-spin h-4 w-4 text-beatrice-glow" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-[13px] text-beatrice-secondary font-semibold">Generating WhatsApp connection...</span>
              </div>
              <p className="text-[11px] text-beatrice-muted text-center max-w-xs mb-3 font-medium">
                Generating QR code via WhatsApp server. Please wait...
              </p>
              <button
                onClick={async () => {
                  await disconnectWhatsApp(userId);
                  setWaPairing(false);
                  setWaStatus('not_found');
                  setWaPairingCode(null);
                  setWaQrCode(null);
                  if (waPollRef.current) clearInterval(waPollRef.current);
                }}
                className="px-4 py-2 bg-beatrice-danger/10 hover:bg-beatrice-danger/20 active:scale-95 rounded-xl text-xs font-semibold text-beatrice-danger border border-beatrice-danger/20 transition-all duration-200 cursor-pointer"
              >
                Cancel Pairing
              </button>
            </div>
          )}

          {waStatus === 'error' && (
            <div className="flex flex-col items-center pt-4 border-t border-white/[0.06]">
              <span className="text-[13px] text-beatrice-danger font-bold mb-1">Pairing Failed</span>
              <p className="text-[11px] text-beatrice-muted text-center max-w-xs mb-3 font-medium leading-relaxed">
                An error occurred during pairing. Please verify your phone number and network connection, then try again.
              </p>
              <button
                onClick={async () => {
                  await disconnectWhatsApp(userId);
                  setWaStatus('not_found');
                  setWaPairing(false);
                  setWaPairingCode(null);
                  setWaQrCode(null);
                  if (waPollRef.current) clearInterval(waPollRef.current);
                }}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 active:scale-95 rounded-xl text-xs font-semibold text-beatrice-text border border-white/5 transition-all duration-200 cursor-pointer"
              >
                Reset & Try Again
              </button>
            </div>
          )}

          {pairingMethod === 'qr' && waQrCode && waStatus === 'qr_ready' && (
            <div className="flex flex-col items-center pt-4 border-t border-white/[0.06]">
              <img src={waQrCode} alt="WhatsApp QR" className="w-44 h-44 rounded-2xl bg-white p-3 mb-3 shadow-[0_4px_24px_rgba(255,255,255,0.05)] border border-white/10" />
              <p className="text-[13px] text-beatrice-secondary text-center font-bold mb-1">Open WhatsApp &gt; Linked Devices &gt; Link a Device</p>
              <p className="text-[11px] text-beatrice-muted text-center max-w-xs mb-4 leading-relaxed font-medium">Scan this QR code from your phone's WhatsApp application to pair.</p>
              <button
                onClick={async () => {
                  await disconnectWhatsApp(userId);
                  setWaQrCode(null);
                  setWaStatus('not_found');
                  setWaPairing(false);
                  if (waPollRef.current) clearInterval(waPollRef.current);
                }}
                className="px-4 py-2 bg-beatrice-danger/10 hover:bg-beatrice-danger/20 active:scale-95 rounded-xl text-xs font-semibold text-beatrice-danger border border-beatrice-danger/20 transition-all duration-200 cursor-pointer"
              >
                Cancel Pairing
              </button>
            </div>
          )}

          {pairingMethod === 'phone' && !waPairingCode && waStatus === 'qr_ready' && (
            <div className="flex flex-col items-center pt-4 border-t border-white/[0.06]">
              <div className="flex items-center gap-2 mb-2">
                <svg className="animate-spin h-4 w-4 text-beatrice-glow" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-[13px] text-beatrice-secondary font-semibold">Generating OTP code...</span>
              </div>
              <p className="text-[11px] text-beatrice-muted text-center max-w-xs mb-3 font-medium">
                Please wait while we request the OTP verification code from WhatsApp...
              </p>
              <button
                onClick={async () => {
                  await disconnectWhatsApp(userId);
                  setWaPairingCode(null);
                  setWaStatus('not_found');
                  setWaPairing(false);
                  if (waPollRef.current) clearInterval(waPollRef.current);
                }}
                className="px-4 py-2 bg-beatrice-danger/10 hover:bg-beatrice-danger/20 active:scale-95 rounded-xl text-xs font-semibold text-beatrice-danger border border-beatrice-danger/20 transition-all duration-200 cursor-pointer"
              >
                Cancel Pairing
              </button>
            </div>
          )}

          {pairingMethod === 'phone' && waPairingCode && waStatus === 'qr_ready' && (
            <div className="flex flex-col items-center pt-4 border-t border-white/[0.06]">
              <div className="bg-beatrice-deep/45 border border-white/[0.06] rounded-2xl px-6 py-4 flex items-center justify-center gap-2 mb-3 select-text shadow-inner">
                {waPairingCode.split('').map((char, i) => (
                  <span key={i} className={`text-2xl font-bold font-mono tracking-wider ${char === '-' ? 'text-beatrice-muted/60 mx-1' : 'text-beatrice-live drop-shadow-[0_0_8px_rgba(8,185,148,0.3)]'}`}>
                    {char}
                  </span>
                ))}
              </div>
              <p className="text-[12px] text-beatrice-secondary text-center max-w-xs mb-1 font-bold">
                Open WhatsApp &gt; Linked Devices &gt; Link a Device &gt; Link with phone number instead
              </p>
              <p className="text-[11px] text-beatrice-muted text-center max-w-xs mb-4 leading-relaxed font-medium">
                Enter the 8-character OTP code shown above on your phone's WhatsApp.
              </p>
              <button
                onClick={async () => {
                  await disconnectWhatsApp(userId);
                  setWaPairingCode(null);
                  setWaStatus('not_found');
                  setWaPairing(false);
                  if (waPollRef.current) clearInterval(waPollRef.current);
                }}
                className="px-4 py-2 bg-beatrice-danger/10 hover:bg-beatrice-danger/20 active:scale-95 rounded-xl text-xs font-semibold text-beatrice-danger border border-beatrice-danger/20 transition-all duration-200 cursor-pointer"
                aria-label="Cancel pairing"
                title="Cancel pairing"
              >
                Cancel Pairing
              </button>
            </div>
          )}
        </div>

        {waStatus === 'paired' && (
          <div className="bg-beatrice-surface/35 border border-white/[0.06] rounded-2xl overflow-hidden mt-4">
            {[
              { key: 'send_messages', label: 'Send Messages', desc: 'Send texts on your behalf', icon: Send },
              { key: 'read_chats', label: 'Read Chats', desc: 'Scan and digest incoming messages', icon: MessageSquare },
              { key: 'access_contacts', label: 'Access Contacts', desc: 'Search and link contact records', icon: User },
              { key: 'manage_contacts', label: 'Manage Contacts', desc: 'Register or update contacts', icon: UserPlus },
              { key: 'access_groups', label: 'Access Groups', desc: 'Browse joined groups', icon: Users },
              { key: 'send_group_messages', label: 'Send Group Messages', desc: 'Post to groups', icon: Send },
              { key: 'read_group_chats', label: 'Read Group Chats', desc: 'Analyze group discussions', icon: MessageSquareText },
              { key: 'view_message_history', label: 'View Message History', desc: 'Read past conversation logs', icon: Clock },
              { key: 'make_calls', label: 'Make Phone Calls', desc: 'Dial contacts via native dialer', icon: Phone },
              { key: 'make_whatsapp_calls', label: 'WhatsApp Calls', desc: 'Initiate WhatsApp calls', icon: Video },
            ].map((p) => (
              <div key={p.key} className="px-5 py-4 flex items-center justify-between border-b border-white/[0.06] last:border-b-0 hover:bg-white/[0.04] transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-xl bg-beatrice-deep/45 flex items-center justify-center shrink-0 text-beatrice-secondary border border-white/[0.06]">
                    <p.icon className="w-5 h-5" strokeWidth={1.5} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[14px] text-beatrice-text/90 font-semibold tracking-tight">{p.label}</span>
                    <span className="text-[11px] text-beatrice-secondary/70 font-medium leading-relaxed">{p.desc}</span>
                  </div>
                </div>
                <button
                  onClick={() => onTogglePermission(p.key)}
                  aria-pressed={waPermissions[p.key]}
                  className={`w-10 h-6 rounded-full transition-all duration-300 flex items-center shrink-0 cursor-pointer ${waPermissions[p.key] ? 'bg-beatrice-live' : 'bg-beatrice-muted/35'}`}
                >
                  <span className={`block w-4.5 h-4.5 rounded-full bg-white transition-all duration-300 shadow-md ${waPermissions[p.key] ? 'ml-[18px]' : 'ml-[3px]'}`} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
