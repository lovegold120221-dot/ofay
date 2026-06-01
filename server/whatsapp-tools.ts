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

export async function handleWhatsAppAction(
  wa: WhatsAppManager,
  userId: string,
  tool: string,
  params: any,
  permissions: Record<string, any> | undefined
): Promise<any> {
  const effectivePermissions = wa.getEffectivePermissions(userId, permissions);

  try {
    switch (tool) {
      // ─── READING ───────────────────────────────────────────────────
      case 'readChats':
        return handleReadChats(wa, userId, effectivePermissions, params.limit);
      case 'getContacts':
        return handleGetContacts(wa, userId, effectivePermissions);
      case 'getGroups':
        return handleGetGroups(wa, userId, effectivePermissions);
      case 'getMessageHistory':
        return handleGetMessageHistory(wa, userId, effectivePermissions, params.chatId || params.to || params.contactId, params.limit);
      case 'getCalls':
        return handleGetCalls(wa, userId, effectivePermissions, params.limit);
      case 'groupInfo':
        return { ok: true, info: await wa.getGroups(userId) }; // Simplified for now
      case 'userCheck':
        return { ok: true, result: await wa.checkWhatsAppUser(userId, params.number || params.to) };
      case 'businessProfile':
        return { ok: false, error: 'Business profile lookup not implemented' };
      case 'avatar':
        return { ok: true, url: await wa.getWhatsAppAvatar(userId, params.to || params.number) };

      // ─── SENDING (REQUIRES APPROVAL) ───────────────────────────────
      case 'sendMessage':
      case 'sendImage':
      case 'sendFile':
      case 'sendVideo':
      case 'sendSticker':
      case 'sendMedia':
      case 'sendAudio':
        return handleSendMediaOrMessage(wa, userId, effectivePermissions, tool, params);
      
      case 'sendPoll':
        const approvalPoll = requireDelegatedSendApproval(effectivePermissions);
        if (approvalPoll) return { ok: false, error: approvalPoll };
        return { ok: true, result: await wa.sendWhatsAppPoll(userId, params.to, params.text || params.name, params.pollOptions || []) };

      case 'sendReaction':
        const approvalReact = requireDelegatedSendApproval(effectivePermissions);
        if (approvalReact) return { ok: false, error: approvalReact };
        return { ok: true, result: await wa.sendWhatsAppReaction(userId, params.to, params.messageId, params.emoji) };

      case 'sendButtons':
        return handleSendButtons(wa, userId, effectivePermissions, params.to, params.text, params.buttons, params.footer);

      // ─── MODIFYING ─────────────────────────────────────────────────
      case 'deleteMessage':
      case 'revokeMessage':
        const approvalDelete = requireDelegatedSendApproval(effectivePermissions);
        if (approvalDelete) return { ok: false, error: approvalDelete };
        return { ok: true, result: await wa.deleteWhatsAppMessage(userId, params.to, params.messageId, tool === 'revokeMessage') };

      case 'markAsRead':
        return { ok: true, result: await wa.markWhatsAppRead(userId, params.to, params.messageId) };

      case 'pinChat':
        return { ok: true, result: await wa.pinWhatsAppChat(userId, params.to, params.pin !== false) };

      case 'disappearingMessages':
        return { ok: true, result: await wa.setWhatsAppDisappearing(userId, params.to, params.limit || 0) };

      // ─── GROUPS ────────────────────────────────────────────────────
      case 'createGroup':
        return { ok: true, result: await wa.createWhatsAppGroup(userId, params.name || params.title, params.participants || []) };
      case 'joinGroup':
        return { ok: true, result: await wa.joinWhatsAppGroup(userId, params.code) };
      case 'manageParticipants':
        return { ok: true, result: await wa.updateWhatsAppGroupParticipants(userId, params.groupId, params.participants, params.action as any) };
      case 'setGroupName':
        return { ok: true, result: await wa.setWhatsAppGroupName(userId, params.groupId, params.name) };
      case 'setGroupTopic':
        return { ok: true, result: await wa.setWhatsAppGroupTopic(userId, params.groupId, params.text || params.topic) };

      // ─── ACCOUNT ───────────────────────────────────────────────────
      case 'changeAvatar':
        return { ok: true, result: await wa.updateWhatsAppAvatar(userId, params.mediaUrl || params.url) };
      case 'changePushName':
        return { ok: true, result: await wa.updateWhatsAppPushName(userId, params.name) };
      case 'sendPresence':
        return { ok: true, result: await wa.setWhatsAppPresence(userId, params.text === 'available' ? 'available' : 'unavailable') };

      default:
        return { ok: false, error: `Unknown WhatsApp tool: ${tool}` };
    }
  } catch (e: any) {
    return { ok: false, error: e.message || 'Operation failed' };
  }
}

async function handleSendMediaOrMessage(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, any> | undefined,
  tool: string,
  params: any
) {
  let mediaType: any = null;
  if (tool === 'sendImage') mediaType = 'image';
  else if (tool === 'sendFile') mediaType = 'document';
  else if (tool === 'sendVideo') mediaType = 'video';
  else if (tool === 'sendSticker') mediaType = 'sticker';
  else if (tool === 'sendAudio') mediaType = 'audio';
  else if (tool === 'sendMedia') mediaType = params.mediaType || params.type || 'image';

  return handleSendMessage(
    wa,
    userId,
    permissions,
    params.to,
    params.text || params.caption || '',
    params.mediaUrl || params.url,
    mediaType,
    params.caption || params.text,
    params.ptt
  );
}

export async function handleSendMessage(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, any> | undefined,
  to: string,
  text: string,
  mediaUrl?: string,
  mediaType?: 'image' | 'video' | 'document' | 'sticker' | 'audio',
  caption?: string,
  ptt?: boolean
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
      const sent = await wa.sendWhatsAppMediaMessage(userId, to, mediaUrl, mediaType, caption || text, ptt);
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
  const contacts = raw.map(c => ({
    id: c.id,
    number: c.number,
    savedName: c.name,
    whatsappProfileName: c.notify,
    verifiedName: c.verifiedName,
  }));
  return { ok: true, contacts };
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
