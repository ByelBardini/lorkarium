import { imageFailureMessage } from '@/components/image-picker-messages';
import type { ChatAttachment, ChatAttachmentRejection } from '@/lib/chat-attachment';
import type { ChatMessage } from '@/lib/chat-conversations';
import type { ChatInputRefusal } from '@/lib/chat-input';
import type { ChatSendFailure } from '@/services/chat-commands';
import {
  INVALID_MESSAGE,
  NOT_MEMBER_MESSAGE,
  OFFLINE_MESSAGE,
  UNEXPECTED_MESSAGE,
} from '@/features/campaigns/campaign-messages';
import { spokenNameOf } from '@/lib/chat-speaker';

export const EMPTY_CONVERSATION = 'Ninguém falou ainda nesta visita.';

export const RECONNECTING_NOTICE = 'Reconectando… o envio volta quando a conexão voltar.';

export const TABLE_CONVERSATION_NAME = 'Mesa';

export const MENTION_MARK = 'Menciona você';

/** Someone who left the roster, as an author or a person of a conversation. */
export const SOMEONE = 'Alguém';

const SEND_FAILURES: Readonly<Record<Exclude<ChatSendFailure['kind'], 'rate_limited'>, string>> = {
  not_found: NOT_MEMBER_MESSAGE,
  forbidden: 'Você não pode falar como esse personagem.',
  recipient_not_member: 'Essa pessoa não está mais na mesa.',
  recipient_is_sender: 'Escolha outra pessoa: a mensagem precisa ser para alguém além de você.',
  sender_not_in_group: 'Você não está nesse grupo.',
  speaker_not_allowed: 'Um personagem só fala para a mesa toda.',
  speaker_not_found: 'Esse personagem não está mais no grid. Você voltou a falar como você.',
  image_expired: 'Essa imagem não está mais disponível. Anexe de novo.',
  invalid: INVALID_MESSAGE,
  unauthenticated: 'Sua sessão terminou. Entre de novo para conversar.',
  offline: OFFLINE_MESSAGE,
  unexpected: UNEXPECTED_MESSAGE,
};

/** The refusal of a message, in pt-BR.
 *
 *  Example: `chatSendFailureMessage({ kind: 'rate_limited', retryAfterSeconds: 3 }) // 'Muitas mensagens seguidas. Espere 3 s.'` */
export function chatSendFailureMessage(failure: ChatSendFailure): string {
  if (failure.kind === 'rate_limited') {
    return `Muitas mensagens seguidas. Espere ${failure.retryAfterSeconds} s.`;
  }
  return SEND_FAILURES[failure.kind];
}

const PLAIN_REFUSALS: Readonly<
  Record<
    'missing_member' | 'rolls_only_at_table' | 'whispers_only_at_table' | 'spectator_cannot_roll',
    string
  >
> = {
  missing_member: 'Diga para quem: /w Nome texto.',
  rolls_only_at_table: 'Rolagens só na Mesa.',
  whispers_only_at_table: 'Sussurros só na Mesa; aqui a conversa já é à parte.',
  spectator_cannot_roll: 'Quem assiste à mesa não rola dados.',
};

/** Why the field cannot go, in pt-BR (the draft stays).
 *
 *  Example: `chatInputRefusalMessage({ kind: 'unknown_command', command: 'xyz' }) // 'Não existe o comando /xyz.'` */
export function chatInputRefusalMessage(reason: ChatInputRefusal): string {
  if (reason.kind === 'unknown_command') return `Não existe o comando /${reason.command}.`;
  if (reason.kind === 'unknown_member') return `Ninguém na mesa se chama ${reason.name}.`;
  if (reason.kind === 'missing_text') return `Escreva o que sussurrar para ${reason.name}.`;
  if (reason.kind === 'missing_roll') return `Escreva a rolagem depois do /${reason.command}.`;
  if (reason.kind === 'too_long') return `A mensagem passa de ${reason.max} caracteres.`;
  return PLAIN_REFUSALS[reason.kind];
}

/** Who would not get the message (nothing is saved: it is lost for them).
 *
 *  Example: `offlineRecipientsText(['Bia'], true) // 'Bia está offline: a mensagem não chegaria.'` */
export function offlineRecipientsText(names: readonly string[], blocked: boolean): string {
  const who = namesText(names);
  const verb = names.length === 1 ? 'está' : 'estão';
  if (blocked) return `${who} ${verb} offline: a mensagem não chegaria.`;
  return `${who} ${verb} offline e não vai receber.`;
}

/** "Bia", "Bia e Caio", "Ana, Bia e Caio".
 *
 *  Example: `namesText(['Ana', 'Bia', 'Caio']) // 'Ana, Bia e Caio'` */
export function namesText(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names.at(-1) ?? ''}`;
}

/** The strip button's name: the conversation and how many are unread.
 *
 *  Example: `unreadLabel('Bia', 2) // 'Bia, 2 não lidas'` */
export function unreadLabel(name: string, unread: number): string {
  if (unread === 0) return name;
  return `${name}, ${unread} ${unread === 1 ? 'não lida' : 'não lidas'}`;
}

/** The whisper mark of a row: to the viewer, or (one's own) to whom.
 *
 *  Example: `whisperMark(null) // 'sussurro pra você'` */
export function whisperMark(toName: string | null): string {
  return toName === null ? 'sussurro pra você' : `sussurro pra ${toName}`;
}

/** Where a message was said, for the announcer: the Table says nothing more. */
export type AnnouncedPlace =
  | Readonly<{ kind: 'table' }>
  | Readonly<{ kind: 'whisper' }>
  | Readonly<{ kind: 'direct' }>
  | Readonly<{ kind: 'group'; name: string }>;

/** What the screen reader hears for a message of someone else.
 *
 *  Example: `chatAnnouncement('Bia', { kind: 'whisper' }, 'Cuidado.') // 'Bia sussurrou para você: Cuidado.'` */
export function chatAnnouncement(author: string, place: AnnouncedPlace, text: string): string {
  if (place.kind === 'whisper') return `${author} sussurrou para você: ${text}`;
  if (place.kind === 'direct') return `${author}, no privado: ${text}`;
  if (place.kind === 'group') return `${author}, em ${place.name}: ${text}`;
  return `${author}: ${text}`;
}

/** One message as a line: the voice (the token spoken as, or the author), where it was said and
 *  the text — what the announcer says, the chat bar and its previews show.
 *
 *  Example: `chatLineOf(message, people.nameOf) // 'Caio: Vou abrir a porta'` */
export function chatLineOf(message: ChatMessage, nameOf: (userId: string) => string): string {
  return chatAnnouncement(chatVoiceOf(message, nameOf), placeOf(message), lineTextOf(message));
}

/** Who a message speaks as: the token's or character's name, or the author's — the start of its `chatLineOf`.
 *
 *  Example: `chatVoiceOf(message, people.nameOf) // 'Kael'` */
export function chatVoiceOf(message: ChatMessage, nameOf: (userId: string) => string): string {
  const { event } = message;
  return spokenNameOf(event.speaker) ?? nameOf(event.fromUserId);
}

/** What a message with only a picture says in a line (the bar, the announcer, the preview). */
export const IMAGE_ONLY_LINE = 'enviou uma imagem';

function lineTextOf({ event }: ChatMessage): string {
  return event.text === '' && event.image !== null ? IMAGE_ONLY_LINE : event.text;
}

function placeOf({ event }: ChatMessage): AnnouncedPlace {
  const { channel } = event;
  if (channel.kind === 'group') return { kind: 'group', name: channel.name };
  if (channel.kind === 'direct') return { kind: 'direct' };
  return channel.whisperTo === null ? { kind: 'table' } : { kind: 'whisper' };
}

/** The chat's counter for the screen reader (the description of "Chat", "Abrir painel", "Painel").
 *
 *  Example: `chatUnreadText(3) // '3 mensagens não lidas'` */
export function chatUnreadText(count: number): string {
  return count === 1 ? '1 mensagem não lida' : `${count} mensagens não lidas`;
}

const CHAT_IMAGE_TOO_LARGE = 'A imagem passa de 10 MB.';

const REJECTIONS: Readonly<Record<ChatAttachmentRejection, string>> = {
  type: 'Só dá para anexar imagens: PNG, JPEG, WebP ou GIF.',
  size: CHAT_IMAGE_TOO_LARGE,
  link: 'Cole um link que comece com http:// ou https://.',
};

/** Why the picture of the composer did not go, in pt-BR; `null` while it is fine.
 *
 *  Example: `chatAttachmentProblem({ kind: 'rejected', reason: 'size' }) // 'A imagem passa de 10 MB.'` */
export function chatAttachmentProblem(attachment: ChatAttachment): string | null {
  if (attachment.kind === 'rejected') return REJECTIONS[attachment.reason];
  if (attachment.kind !== 'failed') return null;
  const { failure } = attachment;
  return failure.kind === 'too_large' ? CHAT_IMAGE_TOO_LARGE : imageFailureMessage(failure);
}
