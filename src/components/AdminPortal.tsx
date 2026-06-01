import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Check,
  KeyRound,
  Loader2,
  LogOut,
  MessageSquare,
  Power,
  QrCode,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone,
  X,
  Send
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { supabase } from '../lib/supabase';
import {
  disconnectWhatsApp,
  getBackendUrl,
  getWhatsAppAdminOverview,
  saveWhatsAppAdminConfig,
  sendWhatsAppTestMessage,
  setBackendUrl,
  startWhatsAppPairing,
} from '../lib/whatsappClient';

const permissionOptions = [
  { key: 'send_messages', label: 'Send messages', note: 'Allows Beatrice to send outbound texts.' },
  { key: 'read_chats', label: 'Read chats', note: 'Allows Beatrice to scan incoming messages.' },
  { key: 'access_contacts', label: 'Access contacts', note: 'Allows linking names to phone numbers.' },
  { key: 'manage_contacts', label: 'Manage contacts', note: 'Allows Beatrice to save/update contacts.' },
  { key: 'access_groups', label: 'Access groups', note: 'Allows Beatrice to see joined groups.' },
  { key: 'send_group_messages', label: 'Send group messages', note: 'Allows Beatrice to send to group JIDs.' },
  { key: 'read_group_chats', label: 'Read group chats', note: 'Allows recent group-message history.' },
  { key: 'view_message_history', label: 'View history', note: 'Allows message lookup by chat ID.' },
] as const;

type PermissionKey = typeof permissionOptions[number]['key'];

const defaultPermissions = permissionOptions.reduce((acc, item) => {
  acc[item.key] = true;
  return acc;
}, {} as Record<PermissionKey, boolean>);

interface AdminPortalProps {
  user: User;
  onBack: () => void;
  onLogout: () => void;
}

export function AdminPortal({ user, onBack, onLogout }: AdminPortalProps) {
  const [backendInput, setBackendInput] = useState(getBackendUrl());
  const [backend, setBackend] = useState(getBackendUrl());
  const [provider, setProvider] = useState<'linked_device' | 'cloud_api'>('linked_device');
  const [displayName, setDisplayName] = useState('');
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [webhookVerifyToken, setWebhookVerifyToken] = useState('');
  const [apiVersion, setApiVersion] = useState('v21.0');
  const [defaultCountryCode, setDefaultCountryCode] = useState('32');
  const [hasAccessToken, setHasAccessToken] = useState(false);
  const [hasAppSecret, setHasAppSecret] = useState(false);
  const [hasWebhookVerifyToken, setHasWebhookVerifyToken] = useState(false);
  const [permissions, setPermissions] = useState<Record<PermissionKey, boolean>>(defaultPermissions);
  const [waStatus, setWaStatus] = useState('not_found');
  const [waPhone, setWaPhone] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [chats, setChats] = useState<any[]>([]);
  const [contactsCount, setContactsCount] = useState(0);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [testTo, setTestTo] = useState('');
  const [testText, setTestText] = useState('Beatrice admin test message.');

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getWhatsAppAdminOverview(user.uid);
      if (data.config) {
        const c = data.config;
        setProvider(c.provider || 'linked_device');
        setDisplayName(c.displayName || '');
        setBusinessAccountId(c.businessAccountId || '');
        setPhoneNumberId(c.phoneNumberId || '');
        setApiVersion(c.apiVersion || 'v21.0');
        setDefaultCountryCode(c.defaultCountryCode || '32');
        setHasAccessToken(!!c.accessToken);
        setHasAppSecret(!!c.appSecret);
        setHasWebhookVerifyToken(!!c.webhookVerifyToken);
        if (c.permissions) {
          setPermissions(prev => ({ ...prev, ...c.permissions }));
        }
      }
      setWaStatus(data.sessionStatus?.status || 'not_found');
      setWaPhone(data.sessionStatus?.phone || '');
      setQrCode(data.sessionStatus?.qrCode || '');
      setMessages(data.recentMessages || []);
      setChats(data.recentChats || []);
      setContactsCount(data.contactsCount || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load WhatsApp overview');
    } finally {
      setLoading(false);
    }
  }, [user.uid]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const applyBackend = () => {
    const url = setBackendUrl(backendInput);
    setBackend(url);
    setNotice(`Backend URL updated to ${url}`);
    loadOverview();
  };

  const saveConfig = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await saveWhatsAppAdminConfig(user.uid, {
        provider,
        displayName,
        businessAccountId,
        phoneNumberId,
        accessToken: accessToken || undefined,
        appSecret: appSecret || undefined,
        webhookVerifyToken: webhookVerifyToken || undefined,
        apiVersion,
        defaultCountryCode,
        permissions,
      });
      setNotice('WhatsApp configuration saved successfully.');
      setAccessToken('');
      setAppSecret('');
      setWebhookVerifyToken('');
      await loadOverview();
    } catch (err: any) {
      setError(err.message || 'Failed to save WhatsApp settings');
    } finally {
      setSaving(false);
    }
  };

  const pairLinkedDevice = async () => {
    setPairing(true);
    setError('');
    setNotice('');
    try {
      await startWhatsAppPairing(user.uid);
      setNotice('Pairing started. Check for QR code.');
      await loadOverview();
    } catch (err: any) {
      setError(err.message || 'Failed to start WhatsApp pairing');
    } finally {
      setPairing(false);
    }
  };

  const disconnect = async () => {
    setError('');
    setNotice('');
    try {
      await disconnectWhatsApp(user.uid);
      setWaStatus('not_found');
      setWaPhone('');
      setQrCode('');
      setNotice('Linked-device session disconnected.');
      await loadOverview();
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect WhatsApp');
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setError('');
    setNotice('');
    try {
      const result = await sendWhatsAppTestMessage(user.uid, testTo, testText);
      if (!result.ok) throw new Error(result.error || 'WhatsApp test failed');
      setNotice(`Test message sent${result.messageId ? ` (${result.messageId})` : ''}.`);
      await loadOverview();
    } catch (err: any) {
      setError(err.message || 'Failed to send test message');
    } finally {
      setTesting(false);
    }
  };

  const enabledCount = useMemo(() => {
    return permissionOptions.filter(item => permissions[item.key]).length;
  }, [permissions]);

  const webhookUrl = useMemo(() => {
    return `${backendInput.replace(/\/+$/, '')}/api/whatsapp/webhook/${encodeURIComponent(user.uid)}`;
  }, [backendInput, user.uid]);

  const formatPhone = (p: string) => {
    const d = p.replace(/\D/g, '');
    return d ? `+${d}` : '';
  };

  return (
    <div className="min-h-screen bg-wa-bg-main text-wa-text-primary">
      <div className="wa-chat-bg opacity-[0.04]" />
      <div className="relative z-10 min-h-screen grid grid-cols-1 lg:grid-cols-[280px_1fr]">
        <aside className="border-b lg:border-b-0 lg:border-r border-white/5 bg-wa-bg-sidebar p-5 lg:min-h-screen shadow-xl flex flex-col">
          <div className="flex items-center justify-between lg:block">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-wa-green">Beatrice</p>
              <h1 className="text-2xl font-bold tracking-tight text-wa-text-primary">Admin Portal</h1>
            </div>
            <button onClick={onBack} className="lg:hidden p-2 rounded-xl bg-white/5 border border-white/10" aria-label="Back to assistant">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>

          <nav className="mt-8 grid gap-2 text-sm">
            {[
              ['Dashboard', Activity],
              ['WhatsApp', Smartphone],
              ['Permissions', ShieldCheck],
              ['Messages', MessageSquare],
            ].map(([label, Icon]) => (
              <a key={String(label)} href={`#${String(label).toLowerCase()}`} className="flex items-center gap-3 px-3 py-3 rounded-xl text-wa-text-secondary hover:bg-white/5 hover:text-wa-text-primary transition-all">
                <Icon className="w-4 h-4 text-wa-green" />
                <span className="font-semibold">{String(label)}</span>
              </a>
            ))}
          </nav>

          <div className="mt-auto pt-8 grid gap-3">
            <button onClick={onBack} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-bold transition-all">
              <ArrowLeft className="w-4 h-4" />
              Assistant
            </button>
            <button onClick={onLogout} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-sm font-bold text-red-400 transition-all">
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </aside>

        <main className="p-4 sm:p-6 lg:p-8 space-y-8 overflow-y-auto">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-wa-text-secondary font-bold">{user.email}</p>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-wa-text-primary">Operations</h2>
            </div>
            <div className="flex gap-2">
              <button onClick={loadOverview} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-sm font-bold transition-all">
                <RefreshCw className="w-4 h-4 text-wa-text-secondary" />
                Refresh
              </button>
              <button onClick={saveConfig} disabled={saving} className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-wa-green text-wa-bg-main font-black hover:brightness-110 disabled:opacity-60 text-sm shadow-lg shadow-wa-green/20 transition-all active:scale-95">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </header>

          {(error || notice) && (
            <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${error ? 'border-red-500/30 bg-red-500/10 text-red-100' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'}`}>
              {error ? <X className="w-4 h-4 mt-0.5 shrink-0" /> : <Check className="w-4 h-4 mt-0.5 shrink-0" />}
              <span>{error || notice}</span>
            </div>
          )}

          <section id="dashboard" className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              ['Status', waStatus === 'paired' ? 'Linked' : provider === 'cloud_api' && hasAccessToken ? 'Cloud ready' : waStatus.replace(/_/g, ' ')],
              ['Permissions', `${enabledCount}/8 enabled`],
              ['Chats', String(chats.length)],
              ['Contacts', String(contactsCount)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-3xl border border-white/5 bg-wa-bg-sidebar p-5 shadow-sm transition-all hover:bg-white/5">
                <p className="text-[10px] uppercase tracking-[0.2em] text-wa-text-secondary font-black">{label}</p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-wa-text-primary capitalize">{value}</p>
              </div>
            ))}
          </section>

          <section id="whatsapp" className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
            <div className="rounded-[32px] border border-white/5 bg-wa-bg-sidebar p-6 sm:p-8 space-y-6 shadow-xl">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-wa-green/10 flex items-center justify-center border border-wa-green/20">
                  <KeyRound className="w-6 h-6 text-wa-green" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-wa-text-primary">WhatsApp Credentials</h3>
                  <p className="text-xs text-wa-text-secondary">Enterprise configuration for delegated operations.</p>
                </div>
              </div>

              <div className="grid gap-6">
                <label className="grid gap-2">
                  <span className="text-[10px] uppercase tracking-widest text-wa-text-secondary font-black">Backend API URL</span>
                  <div className="flex gap-2">
                    <input value={backendInput} onChange={e => setBackendInput(e.target.value)} className="flex-1 rounded-xl bg-wa-bg-main border border-white/5 px-4 py-3 text-sm outline-none focus:border-wa-green/50 shadow-inner" />
                    <button onClick={applyBackend} className="px-4 bg-white/5 border border-white/10 rounded-xl text-xs font-bold hover:bg-white/10">Apply</button>
                  </div>
                </label>

                <div className="grid grid-cols-2 gap-2 rounded-xl bg-wa-bg-main border border-white/5 p-1">
                  <button onClick={() => setProvider('linked_device')} className={`rounded-lg px-3 py-2 text-xs font-black uppercase tracking-widest transition-all ${provider === 'linked_device' ? 'bg-wa-green text-wa-bg-main shadow-md' : 'text-wa-text-secondary hover:bg-white/5'}`}>
                    Linked Device
                  </button>
                  <button onClick={() => setProvider('cloud_api')} className={`rounded-lg px-3 py-2 text-xs font-black uppercase tracking-widest transition-all ${provider === 'cloud_api' ? 'bg-wa-green text-wa-bg-main shadow-md' : 'text-wa-text-secondary hover:bg-white/5'}`}>
                    Cloud API
                  </button>
                </div>

                <label className="grid gap-2">
                  <span className="text-[10px] uppercase tracking-widest text-wa-text-secondary font-black">Connection label</span>
                  <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. Master E WhatsApp" className="rounded-xl bg-wa-bg-main border border-white/5 px-4 py-3 text-sm outline-none focus:border-wa-green/50 shadow-inner" />
                </label>

                {provider === 'cloud_api' && (
                  <div className="grid gap-5 md:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-[10px] uppercase tracking-widest text-wa-text-secondary font-black">Phone Number ID</span>
                      <input value={phoneNumberId} onChange={e => setPhoneNumberId(e.target.value)} className="rounded-xl bg-wa-bg-main border border-white/5 px-4 py-3 text-sm outline-none focus:border-wa-green/50 shadow-inner" />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-[10px] uppercase tracking-widest text-wa-text-secondary font-black">Business Account ID</span>
                      <input value={businessAccountId} onChange={e => setBusinessAccountId(e.target.value)} className="rounded-xl bg-wa-bg-main border border-white/5 px-4 py-3 text-sm outline-none focus:border-wa-green/50 shadow-inner" />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-[10px] uppercase tracking-widest text-wa-text-secondary font-black">Access Token {hasAccessToken ? '(saved)' : ''}</span>
                      <input value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder={hasAccessToken ? 'Leave blank to keep saved token' : 'Permanent or system-user token'} type="password" className="rounded-xl bg-wa-bg-main border border-white/5 px-4 py-3 text-sm outline-none focus:border-wa-green/50 shadow-inner" />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-[10px] uppercase tracking-widest text-wa-text-secondary font-black">App Secret {hasAppSecret ? '(saved)' : ''}</span>
                      <input value={appSecret} onChange={e => setAppSecret(e.target.value)} placeholder="Optional" type="password" className="rounded-xl bg-wa-bg-main border border-white/5 px-4 py-3 text-sm outline-none focus:border-wa-green/50 shadow-inner" />
                    </label>
                    <label className="grid gap-2 md:col-span-2">
                      <span className="text-[10px] uppercase tracking-widest text-wa-text-secondary font-black">Webhook Verify Token {hasWebhookVerifyToken ? '(saved)' : ''}</span>
                      <input value={webhookVerifyToken} onChange={e => setWebhookVerifyToken(e.target.value)} placeholder={hasWebhookVerifyToken ? 'Leave blank to keep saved token' : 'Choose a private verify token'} type="password" className="rounded-xl bg-wa-bg-main border border-white/5 px-4 py-3 text-sm outline-none focus:border-wa-green/50 shadow-inner" />
                    </label>
                    <div className="md:col-span-2 rounded-xl bg-wa-bg-main border border-white/5 p-3">
                      <p className="text-[10px] uppercase tracking-widest text-wa-text-secondary mb-1 font-black">Webhook URL</p>
                      <p className="text-xs text-zinc-400 break-all select-all">{webhookUrl}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[32px] border border-white/5 bg-wa-bg-sidebar p-6 sm:p-8 space-y-6 shadow-xl h-fit">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-wa-text-primary">Session Pairing</h3>
                  <p className="text-xs text-wa-text-secondary">Connect Beatrice to your personal WhatsApp.</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest ${waStatus === 'paired' ? 'bg-wa-green/20 text-wa-green border border-wa-green/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                  {waStatus}
                </span>
              </div>

              {qrCode ? (
                <div className="grid place-items-center rounded-2xl border border-white/5 bg-white p-4 shadow-2xl">
                  <img src={qrCode} alt="WhatsApp pairing QR" className="w-56 h-56 rounded-lg" />
                  <p className="mt-4 text-[11px] text-zinc-500 text-center font-bold">Open WhatsApp &gt; Linked Devices &gt; Link a Device</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/5 bg-wa-bg-main p-6 shadow-inner">
                  <p className="text-sm text-wa-text-secondary font-medium">
                    {waStatus === 'paired' 
                      ? `Beatrice is authorized and linked${waPhone ? ` as ${formatPhone(waPhone)}` : ''}.` 
                      : 'No active session. Generate a QR code or OTP to authorize Beatrice.'}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button onClick={pairLinkedDevice} disabled={pairing} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-wa-green text-wa-bg-main px-4 py-3.5 font-black uppercase tracking-widest text-xs hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-wa-green/20">
                  {pairing ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                  Pair Device
                </button>
                <button onClick={disconnect} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/5 border border-white/10 px-4 py-3.5 text-wa-text-secondary font-black uppercase tracking-widest text-xs hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 transition-all active:scale-95">
                  <Power className="w-4 h-4" />
                  Disconnect
                </button>
              </div>

              <div className="rounded-2xl border border-white/5 bg-wa-bg-main p-5 space-y-4 shadow-inner">
                <p className="text-[10px] font-black uppercase tracking-widest text-wa-text-secondary">Send styles test</p>
                <input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="Recipient number" className="w-full rounded-xl bg-wa-bg-sidebar border border-white/5 px-4 py-3 text-sm outline-none focus:border-wa-green/50" />
                <textarea value={testText} onChange={e => setTestText(e.target.value)} className="w-full min-h-24 rounded-xl bg-wa-bg-sidebar border border-white/5 px-4 py-3 text-sm outline-none focus:border-wa-green/50 resize-none" />
                <button onClick={sendTest} disabled={testing || !testTo || !testText} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-wa-green/10 border border-wa-green/20 px-4 py-3 text-wa-green text-xs font-black uppercase tracking-widest hover:bg-wa-green/20 transition-all">
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send Test
                </button>
              </div>
            </div>
          </section>

          <section id="permissions" className="rounded-[40px] border border-white/5 bg-wa-bg-sidebar p-6 sm:p-8 shadow-xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-wa-green/10 flex items-center justify-center border border-wa-green/20">
                <ShieldCheck className="w-6 h-6 text-wa-green" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-wa-text-primary">Delegated Permissions</h3>
                <p className="text-xs text-wa-text-secondary">Server-side authorization for AI agent tools.</p>
              </div>
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
              {permissionOptions.map(item => (
                <button
                  key={item.key}
                  onClick={() => setPermissions(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                  className={`text-left rounded-3xl border p-5 transition-all group ${permissions[item.key] ? 'border-wa-green/30 bg-wa-green/[0.03]' : 'border-white/5 bg-wa-bg-main/50 hover:bg-white/5'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className={`font-bold text-[14px] ${permissions[item.key] ? 'text-wa-green' : 'text-wa-text-primary group-hover:text-white'}`}>{item.label}</span>
                    <div className={`h-5 w-9 rounded-full p-0.5 transition-colors ${permissions[item.key] ? 'bg-wa-green' : 'bg-zinc-700'}`}>
                      <div className={`h-4 w-4 rounded-full bg-white transition-transform shadow-md ${permissions[item.key] ? 'translate-x-4' : ''}`} />
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-wa-text-secondary leading-relaxed font-medium">{item.note}</p>
                </button>
              ))}
            </div>
          </section>

          <section id="messages" className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-6">
            <div className="rounded-[32px] border border-white/5 bg-wa-bg-sidebar p-6 sm:p-8 shadow-xl overflow-hidden flex flex-col h-[500px]">
              <div className="flex items-center gap-3 mb-6">
                <Activity className="w-5 h-5 text-wa-green" />
                <h3 className="text-xl font-bold text-wa-text-primary">Recent Chats</h3>
              </div>
              <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                {loading ? <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-wa-green" /></div> : chats.length === 0 ? (
                  <p className="text-sm text-wa-text-secondary italic text-center py-12">No chats synced yet.</p>
                ) : chats.map(chat => (
                  <div key={chat.id} className="rounded-2xl border border-white/5 bg-wa-bg-main/50 p-4 transition-all hover:bg-wa-bg-main">
                    <p className="text-[15px] font-bold text-wa-text-primary truncate">{chat.name || chat.id}</p>
                    <p className="text-xs text-wa-text-secondary truncate mt-1">{chat.lastMessage || chat.id}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[32px] border border-white/5 bg-wa-bg-sidebar p-6 sm:p-8 shadow-xl overflow-hidden flex flex-col h-[500px]">
              <div className="flex items-center gap-3 mb-6">
                <MessageSquare className="w-5 h-5 text-wa-green" />
                <h3 className="text-xl font-bold text-wa-text-primary">Activity Stream</h3>
              </div>
              <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                {messages.length === 0 ? (
                  <p className="text-sm text-wa-text-secondary italic text-center py-12">No activity detected.</p>
                ) : messages.map(message => (
                  <div key={`${message.chatId}:${message.id}`} className="rounded-2xl border border-white/5 bg-wa-bg-main/50 p-4 transition-all hover:bg-wa-bg-main">
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <p className="text-[10px] font-black uppercase text-wa-text-secondary tracking-widest">{message.chatId}</p>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter ${message.fromMe ? 'bg-wa-green/10 text-wa-green' : 'bg-white/5 text-zinc-500'}`}>
                        {message.fromMe ? 'sent' : 'received'}
                      </span>
                    </div>
                    <p className="text-[14px] text-wa-text-primary leading-relaxed">{message.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
          
          <footer className="text-center py-12">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-wa-text-secondary/20 italic">Beatrice Operating System · Master E Protocol</p>
          </footer>
        </main>
      </div>
    </div>
  );
}
