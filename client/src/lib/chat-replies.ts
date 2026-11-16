import type { ChatReplyDto, ChatSentDto } from '@lorkarium/contracts';
import type { ChatMessage } from './chat-conversations';

/** The message being answered in the composer, and whether the answer calls its author. */
export type ChatReplyDraft = Readonly<{ message: ChatMessage; mention: boolean }>;

/** Whether a reply calls this viewer: its author asked to mention them, and they did not write it.
 *
 *  Example: `repliesToViewer(event, ana.userId) // true when Bia answered Ana with the @ on` */
export function repliesToViewer(event: ChatSentDto, viewerId: string | null): boolean {
  if (viewerId === null || event.fromUserId === viewerId) return false;
  return event.replyTo?.mentionUserId === viewerId;
}

/** The Table's "Pra quem" a reply keeps: a whispered original is answered in the same whisper
 *  (to whoever of the two is not the viewer), anything else to the whole Table.
 *
 *  Example: `replyWhisperToOf(whisperFromBiaToAna, anaId) // biaId` */
export function replyWhisperToOf(event: ChatSentDto, viewerId: string | null): string | null {
  if (event.channel.kind !== 'table') return null;
  const { whisperTo } = event.channel;
  if (whisperTo === null) return null;
  return whisperTo === viewerId ? event.fromUserId : whisperTo;
}

/** What `chat:send` carries for a draft: the quoted id, and its author only when the @ is on and
 *  the author is somebody else.
 *
 *  Example: `chatReplyOf({ message, mention: true }, anaId) // { messageId, mentionUserId: biaId }` */
export function chatReplyOf(
  draft: ChatReplyDraft | null,
  viewerId: string | null,
): ChatReplyDto | null {
  if (draft === null) return null;
  const { messageId, fromUserId } = draft.message.event;
  const calls = draft.mention && fromUserId !== viewerId;
  return { messageId, mentionUserId: calls ? fromUserId : null };
}

/** The messages of a conversation by id, for each reply to find what it quotes in one look.
 *
 *  Example: `messagesByIdOf(conversation.messages).get(event.replyTo.messageId)` */
export function messagesByIdOf(messages: readonly ChatMessage[]): ReadonlyMap<string, ChatMessage> {
  return new Map(messages.map((message) => [message.event.messageId, message]));
}
