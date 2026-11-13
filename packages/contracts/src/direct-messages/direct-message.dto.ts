import { z } from 'zod';
import { realtimeAckFailureDto } from '../http/realtime-ack.dto';
import { DIRECT_MESSAGE_MAX_LENGTH } from '../realtime-limits';

export const DM_EVENTS = {
  send: 'dm:send',
  sent: 'dm:sent',
  typing: 'dm:typing',
  typingFrom: 'dm:typingFrom',
} as const;

/** Refusal codes of `dm:send` (`apiErrorDto.code`); `RATE_LIMITED` is the shared one. */
export const DM_ERROR_CODES = {
  notFriends: 'DM_NOT_FRIENDS',
  recipientOffline: 'DM_RECIPIENT_OFFLINE',
  senderInvisible: 'DM_SENDER_INVISIBLE',
  rateLimited: 'RATE_LIMITED',
} as const;
export type DmErrorCode = (typeof DM_ERROR_CODES)[keyof typeof DM_ERROR_CODES];

/** A direct message: trimmed, 1 to 2000 characters.
 *
 *  Example: `directMessageTextDto.parse('  oi ') // 'oi'` */
export const directMessageTextDto = z
  .string()
  .trim()
  .min(1, `direct message is empty; expected 1 to ${DIRECT_MESSAGE_MAX_LENGTH} characters`)
  .max(
    DIRECT_MESSAGE_MAX_LENGTH,
    `direct message is too long; expected at most ${DIRECT_MESSAGE_MAX_LENGTH} characters`,
  );

/** `dm:send`: the sender comes from the connection, never from here (§7.3). Nothing is saved.
 *
 *  Example: `dmSendCommandDto.parse({ actionId, toUserId, text: 'oi' })` */
export const dmSendCommandDto = z.strictObject({
  actionId: z.uuid(),
  toUserId: z.uuid(),
  text: directMessageTextDto,
});
export type DmSendCommandDto = z.infer<typeof dmSendCommandDto>;
export type DmSendCommandInput = z.input<typeof dmSendCommandDto>;

/** Answer to `dm:send`: the id the `dm:sent` carries, or the API error (`DM_ERROR_CODES`). */
export const dmSendAckDto = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), messageId: z.uuid() }),
  realtimeAckFailureDto,
]);
export type DmSendAckDto = z.infer<typeof dmSendAckDto>;

/** `dm:sent`: to the `user:<id>` rooms of both accounts (every tab). No version: nothing is saved.
 *
 *  Example: `dmSentDto.safeParse(payload).success` */
export const dmSentDto = z.strictObject({
  messageId: z.uuid(),
  fromUserId: z.uuid(),
  toUserId: z.uuid(),
  text: directMessageTextDto,
  at: z.iso.datetime(),
});
export type DmSentDto = z.infer<typeof dmSentDto>;

/** `dm:typing`: no ack; over its own bucket it drops silently. */
export const dmTypingCommandDto = z.strictObject({ toUserId: z.uuid() });
export type DmTypingCommandDto = z.infer<typeof dmTypingCommandDto>;

/** `dm:typingFrom`: to the recipient's room only. */
export const dmTypingFromDto = z.strictObject({ fromUserId: z.uuid(), at: z.iso.datetime() });
export type DmTypingFromDto = z.infer<typeof dmTypingFromDto>;

/** Client → server direct message events, for the Socket.IO generics on both ends. */
export type DmClientEvents = {
  'dm:send': (command: DmSendCommandDto, ack: (answer: DmSendAckDto) => void) => void;
  'dm:typing': (command: DmTypingCommandDto) => void;
};

/** Server → client direct message events. */
export type DmServerEvents = {
  'dm:sent': (event: DmSentDto) => void;
  'dm:typingFrom': (event: DmTypingFromDto) => void;
};
