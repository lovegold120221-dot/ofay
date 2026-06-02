import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Loader2,
  Send,
} from 'lucide-react';
import {
  callWhatsAppTool,
  DELEGATED_SEND_PERMISSIONS,
  disconnectWhatsApp,
  getBackendUrl,
  getWhatsAppStatus,
  setBackendUrl,
  startWhatsAppPairing,
  type WaChatSummary,
  type WaMessageRecord,
} from '../lib/whatsappClient';

import { 
  Sidebar, 
  ChatList, 
  ChatArea, 
  WelcomeScreen, 
  ScanBarcode 
} from './whatsapp';

const TEST_PERMISSIONS = {
  send_messages: true,
  read_chats: true,
  access_contacts: true,
  manage_contacts: true,
  access_groups: true,
  send_group_messages: true,
  read_group_chats: true,
  view_message_history: true,
};

type SendPreview = {
  to: string;
  text: string;
};

export function TestWhatsAppPage() {
  const [backendInput, setBackendInput] = useState(getBackendUrl());
  const [backend, setBackend] = useState(getBackendUrl());
  const [userId, setUserId] = useState(() => {
    try { return localStorage.getItem('test_whatsapp_user_id') || 'master-e'; } catch { return 'master-e'; }
  });
  const [status, setStatus] = useState<any>({ status: 'unknown' });
  const [qrBust, setQrBust] = useState(Date.now());
  const [chats, setChats] = useState<WaChatSummary[]>([]);
  const [selectedChat, setSelectedChat] = useState<WaChatSummary | null>(null);
  const [messages, setMessages] = useState<WaMessageRecord[]>([]);
  const [messageText, setMessageText] = useState('');
  const [preview, setPreview] = useState<SendPreview | null>(null);
  
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [isPhoneMode, setIsPhoneMode] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');

  const qrUrl = useMemo(() => {
    return `${backend}/api/whatsapp/qr/${encodeURIComponent(userId)}?t=${qrBust}`;
  }, [backend, userId, qrBust]);

  const applyBackend = () => {
    const next = setBackendUrl(backendInput);
    setBackendInput(next);
    setBackend(next);
  };

  const loadStatus = async () => {
    setLoadingStatus(true);
    try {
      const next = await getWhatsAppStatus(userId);
      setStatus(next);
      if (next.qrCode || next.status === 'qr_ready') setQrBust(Date.now());
    } catch (err: any) {
      setError(err.message || 'Failed to load WhatsApp status');
    } finally {
      setLoadingStatus(false);
    }
  };

  const startPairing = async () => {
    setError('');
    setNotice('Initializing session...');
    // Reset local status to avoid stale data
    setStatus({ status: 'init' });
    setChats([]);
    setSelectedChat(null);
    
    try {
      const result = await startWhatsAppPairing(userId, isPhoneMode ? phoneNumber : undefined);
      setStatus(result);
      if (result.status === 'qr_ready') setQrBust(Date.now());
    } catch (err: any) {
      setError(err.message || 'Failed to start pairing');
      setStatus({ status: 'error' });
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect this WhatsApp session?')) return;
    setError('');
    try {
      await disconnectWhatsApp(userId);
      setChats([]);
      setMessages([]);
      setSelectedChat(null);
      await loadStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect WhatsApp');
    }
  };

  const loadChats = async () => {
    setLoadingChats(true);
    setError('');
    try {
      const result = await callWhatsAppTool(userId, 'readChats', { limit: 100 }, TEST_PERMISSIONS);
      if (!result?.ok) throw new Error(result?.error || 'Failed to load chats');
      const nextChats = Array.isArray(result.chats) ? result.chats : [];
      setChats(nextChats);
    } catch (err: any) {
      setError(err.message || 'Failed to load chats');
    } finally {
      setLoadingChats(false);
    }
  };

  const loadMessages = async (chatId = selectedChat?.id) => {
    if (!chatId) return;
    setLoadingMessages(true);
    setError('');
    try {
      const result = await callWhatsAppTool(userId, 'getMessageHistory', { chatId, limit: 100 }, TEST_PERMISSIONS);
      if (!result?.ok) throw new Error(result?.error || 'Failed to load message history');
      setMessages(Array.isArray(result.messages) ? result.messages : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load message history');
    } finally {
      setLoadingMessages(false);
    }
  };

  const sendMessage = async () => {
    const to = selectedChat?.id;
    const text = messageText.trim();
    if (!to || !text) return;

    setSending(true);
    setError('');
    try {
      const result = await callWhatsAppTool(
        userId,
        'sendMessage',
        { to, text },
        { ...TEST_PERMISSIONS, ...DELEGATED_SEND_PERMISSIONS },
      );
      if (!result?.ok) throw new Error(result?.error || 'Message failed');
      setMessageText('');
      await loadMessages(to);
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    try { localStorage.setItem('test_whatsapp_user_id', userId); } catch {}
  }, [userId]);

  useEffect(() => {
    loadStatus();
    const id = window.setInterval(loadStatus, 5000);
    return () => window.clearInterval(id);
  }, [userId, backend]);

  useEffect(() => {
    if (selectedChat?.id) loadMessages(selectedChat.id);
  }, [selectedChat?.id]);

  useEffect(() => {
    if (status.status === 'paired' && chats.length === 0 && !loadingChats) {
      loadChats();
    }
  }, [status.status]);

  const handleSendFile = async (file: File) => {
    const to = selectedChat?.id;
    if (!to) return;

    setSending(true);
    setError('');
    try {
      // For testing, we send a mock media URL based on the file type
      const mediaType = file.type.startsWith('image/') ? 'image' : 
                        file.type.startsWith('video/') ? 'video' : 'document';
      
      const result = await callWhatsAppTool(
        userId,
        'sendMedia',
        { 
          to, 
          mediaUrl: 'https://placehold.co/600x400', // Mock URL
          mediaType,
          caption: `Testing attachment: ${file.name}`
        },
        { ...TEST_PERMISSIONS, ...DELEGATED_SEND_PERMISSIONS },
      );
      
      if (!result?.ok) throw new Error(result?.error || 'Media failed');
      setNotice(`Sent ${file.name} as ${mediaType}.`);
      await loadMessages(to);
    } catch (err: any) {
      setError(err.message || 'Failed to send file');
    } finally {
      setSending(false);
    }
  };

  const handleCall = async (type: 'audio' | 'video') => {
    const to = selectedChat?.id;
    if (!to) return;
    setNotice(`Initiating ${type} call to ${selectedChat.name || to}... (Requires backend support)`);
    // Logic to call backend for calling could go here
  };

  const [notice, setNotice] = useState('');

  // Main paired view
  if (status.status === 'paired') {
    return (
      <div className="flex h-screen w-full bg-[#111b21] overflow-hidden">
        {/* Layout Container */}
        <div className="flex w-full h-full max-w-[1600px] mx-auto shadow-2xl">
          {/* Sidebar */}
          <div className="w-[30%] min-w-[340px] max-w-[450px] h-full">
            <Sidebar 
              userPhone={status.phone}
              onLogout={disconnect}
            >
              <ChatList 
                chats={chats}
                selectedChatId={selectedChat?.id}
                onSelectChat={setSelectedChat}
                loading={loadingChats}
              />
            </Sidebar>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 h-full">
            {selectedChat ? (
              <ChatArea 
                chat={selectedChat}
                messages={messages}
                loadingMessages={loadingMessages}
                messageText={messageText}
                onMessageChange={setMessageText}
                onSend={sendMessage}
                onSendFile={handleSendFile}
                onCall={handleCall}
                sending={sending}
              />
            ) : (
              <WelcomeScreen />
            )}
          </div>
        </div>

        {/* Global Error/Notice */}
        <AnimatePresence>
          {(error || notice) && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-xl text-sm font-medium flex items-center gap-2 ${error ? 'bg-red-500 text-white' : 'bg-wa-green text-wa-bg-main'}`}
            >
              <span>{error || notice}</span>
              <button onClick={() => { setError(''); setNotice(''); }} className="p-1 hover:bg-black/10 rounded-full">✕</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Pairing / Unpaired view
  return (
    <div className="min-h-screen bg-[#eae6df] flex flex-col">
       <div className="h-[220px] bg-wa-green w-full absolute top-0 left-0" />
       
       <div className="z-10 flex-1 flex flex-col max-w-[1000px] w-full mx-auto my-8 bg-white shadow-xl rounded-sm overflow-hidden">
          <header className="px-12 py-8 flex items-center justify-between shrink-0">
             <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-wa-green rounded-full flex items-center justify-center text-white">
                   <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                      <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.767 5.767 0 1.267.408 2.438 1.103 3.394l-.737 2.73 2.793-.733a5.726 5.726 0 0 0 2.608.628c3.181 0 5.767-2.586 5.767-5.767s-2.586-5.719-5.767-5.719zm0 10.453c-1.16 0-2.235-.333-3.14-.905l-.225-.133-1.644.432.44-1.595-.147-.234a4.636 4.636 0 0 1-.72-2.49c0-2.564 2.083-4.647 4.647-4.647 2.564 0 4.647 2.083 4.647 4.647s-2.083 4.647-4.647 4.647z"/>
                   </svg>
                </div>
                <span className="text-[14px] font-bold text-white uppercase tracking-wider">Voxx-Zero WhatsApp</span>
             </div>
             
             <div className="flex items-center gap-4">
                <div className="flex flex-col">
                   <span className="text-[10px] text-white/60 uppercase font-black">Backend</span>
                   <input 
                    value={backendInput}
                    onChange={(e) => setBackendInput(e.target.value)}
                    className="bg-white/10 border border-white/20 rounded px-2 py-0.5 text-xs text-white outline-none focus:bg-white/20"
                    placeholder="Backend URL"
                   />
                </div>
                <button 
                  onClick={applyBackend}
                  className="bg-white/20 text-white px-3 py-1 rounded text-xs font-bold hover:bg-white/30"
                >
                  Apply
                </button>
                <div className="w-[1px] h-8 bg-white/10 mx-2" />
                <div className="flex flex-col">
                   <span className="text-[10px] text-white/60 uppercase font-black">User ID</span>
                   <input 
                    value={userId}
                    onChange={(e) => setUserId(e.target.value.trim())}
                    className="bg-white/10 border border-white/20 rounded px-2 py-0.5 text-xs text-white outline-none focus:bg-white/20"
                    placeholder="User ID"
                   />
                </div>
                <button 
                  onClick={startPairing}
                  className="bg-white text-wa-green px-4 py-1 rounded text-sm font-bold shadow-sm hover:bg-gray-50 active:scale-95 transition-all"
                >
                  Pair Device
                </button>
             </div>
          </header>

          <ScanBarcode 
            qrCode={!isPhoneMode ? (status.qrCode || qrUrl) : undefined}
            pairingCode={status.pairingCode}
            status={status.status}
            onRefresh={loadStatus}
            loading={loadingStatus}
          />
       </div>

       <footer className="z-10 py-8 flex flex-col items-center gap-4 text-[#667781] text-[14px]">
          <div 
            onClick={() => setIsPhoneMode(!isPhoneMode)}
            className="flex items-center gap-2 text-wa-green uppercase text-[12px] font-bold tracking-widest cursor-pointer hover:underline"
          >
             <Smartphone className="w-4 h-4" />
             <span>{isPhoneMode ? 'Switch to QR Code' : 'Link with phone number'}</span>
          </div>

          {isPhoneMode && !status.pairingCode && (
            <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-black/5 shadow-sm">
               <input 
                 value={phoneNumber}
                 onChange={(e) => setPhoneNumber(e.target.value)}
                 placeholder="Phone with country code"
                 className="px-3 py-1 text-xs border border-gray-200 rounded outline-none focus:border-wa-green"
               />
               <button 
                 onClick={startPairing}
                 className="bg-wa-green text-white px-3 py-1 rounded text-xs font-bold"
               >
                 Get Code
               </button>
            </div>
          )}

          <p>This is a secure bridge to your WhatsApp session. Your data is encrypted.</p>
       </footer>
    </div>
  );
}
