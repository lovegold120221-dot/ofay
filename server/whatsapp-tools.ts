import type { WhatsAppManager } from './whatsapp';
import { toWhatsAppJid } from './whatsapp';

const ALL_PERMISSIONS = [
  'send_messages',
  'read_chats',
  'access_contacts',
  'manage_contacts',
  'access_groups',
  'send_group_messages',
  'read_group_chats',
  'view_message_history',
] as const;

type Permission = typeof ALL_PERMISSIONS[number];
const HISTORY_RESPONSE_LIMIT = Math.max(50, Math.min(Number(process.env.WA_HISTORY_RESPONSE_LIMIT) || 2_000, 10_000));

function requirePerm(permissions: Record<string, any> | undefined, perm: Permission): string | null {
  if (!permissions?.[perm]) {
    return `Permission denied: "${perm}" is not enabled. User must enable this toggle in settings.`;
  }
  return null;
}

function requireDelegatedSendApproval(permissions: Record<string, any> | undefined): string | null {
  if (permissions?.requireUserApproval !== true) {
    return 'Delegated WhatsApp sends require requireUserApproval=true.';
  }
  if (permissions?.approvedByUser !== true) {
    return 'Delegated WhatsApp send blocked: user approval is required before sending.';
  }
  if (permissions?.mode !== 'delegated_send') {
    return 'Delegated WhatsApp sends require mode="delegated_send".';
  }
  return null;
}

function cleanLimit(limit: unknown, fallback = 20, max = 50): number {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function requireText(value: unknown, label: string): string | null {
  const text = String(value || '').trim();
  if (!text) return `${label} required`;
  return null;
}

export async function handleSendMessage(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, any> | undefined,
  to: string,
  text: string,
  mediaUrl?: string,
  mediaType?: 'image' | 'video' | 'document',
  caption?: string
): Promise<{ ok: true; sent: boolean; chatId: string; messageId?: string } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'send_messages');
  if (denied) return { ok: false, error: denied };
  const approvalDenied = requireDelegatedSendApproval(permissions);
  if (approvalDenied) return { ok: false, error: approvalDenied };

  const recipientError = requireText(to, 'Recipient');
  if (recipientError) return { ok: false, error: recipientError };
  
  if (!mediaUrl) {
    const textError = requireText(text, 'Message text');
    if (textError) return { ok: false, error: textError };
  }

  try {
    const sock = wa.getClient(userId);
    const chatId = wa.resolveContactJid(userId, to);

    if (mediaUrl && mediaType) {
      const sent = await wa.sendWhatsAppMediaMessage(userId, to, mediaUrl, mediaType, caption || text);
      if (sent) return { ok: true, sent: true, chatId: sent.chatId, messageId: sent.messageId };
      return { ok: false, error: 'Failed to send media message' };
    }

    if (!sock) {
      const cloudSent = await wa.sendCloudTextMessage(userId, to, text);
      if (cloudSent) {
        return { ok: true, sent: true, chatId: cloudSent.chatId, messageId: cloudSent.messageId };
      }
      return { ok: false, error: 'WhatsApp not paired and no WhatsApp Cloud API credentials are configured' };
    }
    const sent = await sock.sendMessage(chatId, { text });
    return { ok: true, sent: true, chatId, messageId: sent?.key?.id };
  } catch (error: any) {
    return { ok: false, error: error.message || 'Send failed' };
  }
}

export async function handleReadChats(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, any> | undefined,
  limit: number = 20,
): Promise<{ ok: true; chats: any[] } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'read_chats');
  if (denied) return { ok: false, error: denied };
  if (!wa.isPaired(userId)) return { ok: false, error: 'WhatsApp not paired' };
  return { ok: true, chats: wa.getChats(userId, cleanLimit(limit)) };
}

export async function handleGetContacts(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, any> | undefined,
): Promise<{ ok: true; contacts: any[] } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'access_contacts');
  if (denied) return { ok: false, error: denied };
  if (!wa.isPaired(userId)) return { ok: false, error: 'WhatsApp not paired' };
  const raw = wa.getContacts(userId);
  // Enrich contacts with explicit labels so the AI model can distinguish
  // between the user's saved name and the contact's own WhatsApp profile name
  const contacts = raw.map(c => ({
    id: c.id,
    number: c.number,
    savedName: c.name,            // What the USER saved this contact as in their phonebook
    whatsappProfileName: c.notify, // The contact's own public WhatsApp display name (pushName)
    verifiedName: c.verifiedName,  // Verified business name (if applicable)
  }));
  return { ok: true, contacts };
}

export async function handleAddContact(
  _wa: WhatsAppManager,
  _userId: string,
  permissions: Record<string, any> | undefined,
  name: string,
  number: string,
): Promise<{ ok: true; added: boolean } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'manage_contacts');
  if (denied) return { ok: false, error: denied };
  const nameError = requireText(name, 'Contact name');
  if (nameError) return { ok: false, error: nameError };
  const numberError = requireText(number, 'Contact number');
  if (numberError) return { ok: false, error: numberError };
  return {
    ok: false,
    error: 'Adding contacts is not exposed by Baileys as a reliable WhatsApp Web operation. Save the contact on the device, then refresh contacts.',
  };
}

export async function handleGetGroups(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, any> | undefined,
): Promise<{ ok: true; groups: any[] } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'access_groups');
  if (denied) return { ok: false, error: denied };
  if (!wa.isPaired(userId)) return { ok: false, error: 'WhatsApp not paired' };
  try {
    const groups = await wa.getGroups(userId);
    return { ok: true, groups };
  } catch (error: any) {
    return { ok: false, error: error.message || 'Failed to get groups' };
  }
}

export async function handleSendGroupMessage(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, any> | undefined,
  groupId: string,
  text: string,
): Promise<{ ok: true; sent: boolean; groupId: string; messageId?: string } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'send_group_messages');
  if (denied) return { ok: false, error: denied };
  const approvalDenied = requireDelegatedSendApproval(permissions);
  if (approvalDenied) return { ok: false, error: approvalDenied };

  const groupError = requireText(groupId, 'Group ID');
  if (groupError) return { ok: false, error: groupError };
  const textError = requireText(text, 'Message text');
  if (textError) return { ok: false, error: textError };

  const sock = wa.getClient(userId);
  if (!sock) return { ok: false, error: 'WhatsApp not paired' };

  try {
    const jid = toWhatsAppJid(groupId, true);
    const sent = await sock.sendMessage(jid, { text });
    return { ok: true, sent: true, groupId: jid, messageId: sent?.key?.id };
  } catch (error: any) {
    return { ok: false, error: error.message || 'Failed to send group message' };
  }
}

export async function handleReadGroupChat(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, any> | undefined,
  groupId: string,
  limit: number = 20,
): Promise<{ ok: true; messages: any[] } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'read_group_chats');
  if (denied) return { ok: false, error: denied };
  if (!wa.isPaired(userId)) return { ok: false, error: 'WhatsApp not paired' };
  const groupError = requireText(groupId, 'Group ID');
  if (groupError) return { ok: false, error: groupError };
  return { ok: true, messages: wa.getMessageHistory(userId, toWhatsAppJid(groupId, true), cleanLimit(limit, HISTORY_RESPONSE_LIMIT, HISTORY_RESPONSE_LIMIT)) };
}

export async function handleGetMessageHistory(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, any> | undefined,
  chatId: string,
  limit: number = 20,
): Promise<{ ok: true; messages: any[] } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'view_message_history');
  if (denied) return { ok: false, error: denied };
  if (!wa.isPaired(userId)) return { ok: false, error: 'WhatsApp not paired' };
  const chatError = requireText(chatId, 'Chat ID');
  const resolvedJid = wa.resolveContactJid(userId, chatId);
  return { ok: true, messages: wa.getMessageHistory(userId, resolvedJid, cleanLimit(limit, HISTORY_RESPONSE_LIMIT, HISTORY_RESPONSE_LIMIT)) };
}

export async function handleGetCalls(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, any> | undefined,
  limit: number = 20,
): Promise<{ ok: true; calls: any[] } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'view_message_history');
  if (denied) return { ok: false, error: denied };
  if (!wa.isPaired(userId)) return { ok: false, error: 'WhatsApp not paired' };
  return { ok: true, calls: wa.getCalls(userId, cleanLimit(limit)) };
}

export async function handleSendMedia(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, any> | undefined,
  to: string,
  url: string,
  type: 'image' | 'video' | 'document',
  caption?: string,
): Promise<{ ok: true; sent: boolean; chatId: string; messageId?: string } | { ok: false; error: string }> {
  const text = caption || '';
  return handleSendMessage(wa, userId, permissions, to, text, url, type, caption);
}

export async function handleSendAudio(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, any> | undefined,
  to: string,
  url: string,
  ptt?: boolean,
): Promise<{ ok: true; sent: boolean; chatId: string; messageId?: string } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'send_messages');
  if (denied) return { ok: false, error: denied };
  const approvalDenied = requireDelegatedSendApproval(permissions);
  if (approvalDenied) return { ok: false, error: approvalDenied };

  const recipientError = requireText(to, 'Recipient');
  if (recipientError) return { ok: false, error: recipientError };
  const urlError = requireText(url, 'Audio URL');
  if (urlError) return { ok: false, error: urlError };

  const sock = wa.getClient(userId);
  if (!sock) return { ok: false, error: 'WhatsApp not paired' };

  try {
    const chatId = wa.resolveContactJid(userId, to);
    const sent = await sock.sendMessage(chatId, { audio: { url }, ptt: !!ptt, mimetype: 'audio/mpeg' });
    return { ok: true, sent: true, chatId, messageId: sent?.key?.id };
  } catch (error: any) {
    return { ok: false, error: error.message || 'Failed to send audio' };
  }
}

export async function handleSendReaction(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, any> | undefined,
  chatId: string,
  messageId: string,
  emoji: string,
): Promise<{ ok: true; sent: boolean; chatId: string; messageId?: string } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'send_messages');
  if (denied) return { ok: false, error: denied };
  const approvalDenied = requireDelegatedSendApproval(permissions);
  if (approvalDenied) return { ok: false, error: approvalDenied };

  const chatError = requireText(chatId, 'Chat ID');
  if (chatError) return { ok: false, error: chatError };
  const messageError = requireText(messageId, 'Message ID');
  if (messageError) return { ok: false, error: messageError };
  const emojiError = requireText(emoji, 'Emoji');
  if (emojiError) return { ok: false, error: emojiError };

  const sock = wa.getClient(userId);
  if (!sock) return { ok: false, error: 'WhatsApp not paired' };

  try {
    const jid = wa.resolveContactJid(userId, chatId);
    const sent = await sock.sendMessage(jid, {
      react: { text: emoji, key: { remoteJid: jid, id: messageId } },
    });
    return { ok: true, sent: true, chatId: jid, messageId: sent?.key?.id };
  } catch (error: any) {
    return { ok: false, error: error.message || 'Failed to send reaction' };
  }
}

export async function handleSendButtons(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, any> | undefined,
  to: string,
  text: string,
  buttons: Array<{ id?: string; text?: string }> = [],
  footer?: string,
): Promise<{ ok: true; sent: boolean; chatId: string; messageId?: string } | { ok: false; error: string }> {
  const renderedButtons = buttons
    .map((button, index) => `${index + 1}. ${button.text || button.id || `Option ${index + 1}`}`)
    .join('\n');
  const body = [text, renderedButtons, footer].filter(Boolean).join('\n\n');
  return handleSendMessage(wa, userId, permissions, to, body);
}
