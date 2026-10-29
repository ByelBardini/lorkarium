import { z } from 'zod';
import { TOKEN_NAME_MAX_LENGTH } from '../board/token.dto';
import { realtimeAckFailureDto } from '../http/realtime-ack.dto';

export const CHAT_EVENTS = {
  send: 'chat:send',
  sent: 'chat:sent',
} as const;

export const CHAT_TEXT_MAX = 2000;
export const CHAT_GROUP_NAME_MAX = 40;
/** The sender counts: a group is the sender plus at least one person. */
export const CHAT_GROUP_MEMBERS_MIN = 2;
export const CHAT_GROUP_MEMBERS_MAX = 30;

/** A message: trimmed, 1 to 2000 characters.
 *
 *  Example: `chatTextDto.parse('  oi ') // 'oi'` */
export const chatTextDto = z
  .string()
  .trim()
  .min(1, 'chat text is empty; expected 1 to 2000 characters')
  .max(CHAT_TEXT_MAX, `chat text is too long; expected at most ${CHAT_TEXT_MAX} characters`);

const groupMemberIdsDto = z
  .array(z.uuid())
  .min(CHAT_GROUP_MEMBERS_MIN)
  .max(CHAT_GROUP_MEMBERS_MAX)
  .superRefine((ids, context) => {
    const repeated = ids.find((id, index) => ids.indexOf(id) !== index);
    if (repeated === undefined) return;
    context.addIssue({
      code: 'custom',
      message: `chat group member ${repeated} is repeated; expected distinct member ids`,
    });
  });

/** The Table (whole campaign); `whisperTo` turns it into an inline whisper to one member. */
export const chatTableChannelDto = z.strictObject({
  kind: z.literal('table'),
  whisperTo: z.uuid().nullable(),
});

/** A fixed group: the creator draws `groupId`; name and members travel on every message and
 *  the server only checks the members. */
export const chatGroupChannelDto = z.strictObject({
  kind: z.literal('group'),
  groupId: z.uuid(),
  name: z.string().trim().min(1).max(CHAT_GROUP_NAME_MAX),
  memberIds: groupMemberIdsDto,
});
export type ChatGroupChannelDto = z.infer<typeof chatGroupChannelDto>;

/** Where a command goes: the Table, a direct conversation with one person, or a group.
 *
 *  Example: `chatChannelDto.parse({ kind: 'direct', userId })` */
export const chatChannelDto = z.discriminatedUnion('kind', [
  chatTableChannelDto,
  z.strictObject({ kind: z.literal('direct'), userId: z.uuid() }),
  chatGroupChannelDto,
]);
export type ChatChannelDto = z.infer<typeof chatChannelDto>;

/** Both people of a direct conversation, in ascending order: the same key on both ends. */
const directPairDto = z.tuple([z.uuid(), z.uuid()]).superRefine(([first, second], context) => {
  if (first < second) return;
  context.addIssue({
    code: 'custom',
    message: `direct chat pair [${first}, ${second}] is invalid; expected two distinct ids in ascending order`,
  });
});

/** Where an event belongs: as the command, but a direct conversation names both people. */
export const chatSentChannelDto = z.discriminatedUnion('kind', [
  chatTableChannelDto,
  z.strictObject({ kind: z.literal('direct'), userIds: directPairDto }),
  chatGroupChannelDto,
]);
export type ChatSentChannelDto = z.infer<typeof chatSentChannelDto>;

/** Who speaks in a command: oneself, or a token of a grid (the server checks control).
 *
 *  Example: `chatSpeakerDto.parse({ kind: 'token', sceneId, tokenId })` */
export const chatSpeakerDto = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('self') }),
  z.strictObject({ kind: z.literal('token'), sceneId: z.uuid(), tokenId: z.uuid() }),
]);
export type ChatSpeakerDto = z.infer<typeof chatSpeakerDto>;

/** Who spoke in an event: the token comes back with the name the server read, never the client's. */
export const chatSentSpeakerDto = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('self') }),
  z.strictObject({
    kind: z.literal('token'),
    sceneId: z.uuid(),
    tokenId: z.uuid(),
    name: z.string().min(1).max(TOKEN_NAME_MAX_LENGTH),
  }),
]);
export type ChatSentSpeakerDto = z.infer<typeof chatSentSpeakerDto>;

/** `chat:send`: the sender comes from the connection, never from here (§7.3). Nothing is saved.
 *
 *  Example: `chatSendCommandDto.parse({ actionId, campaignId, channel, speaker: { kind: 'self' }, text: 'oi' })` */
export const chatSendCommandDto = z.strictObject({
  actionId: z.uuid(),
  campaignId: z.uuid(),
  channel: chatChannelDto,
  speaker: chatSpeakerDto,
  text: chatTextDto,
});
export type ChatSendCommandDto = z.infer<typeof chatSendCommandDto>;
export type ChatSendCommandInput = z.input<typeof chatSendCommandDto>;

/** Answer to `chat:send`: the id the `chat:sent` carries, or the API error.
 *
 *  Example: `chatSendAckDto.parse(answer).ok` */
export const chatSendAckDto = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), messageId: z.uuid() }),
  realtimeAckFailureDto,
]);
export type ChatSendAckDto = z.infer<typeof chatSendAckDto>;

/** `chat:sent`: to the whole table, or only to the people of the whisper/direct/group (the sender
 *  included, every tab). No `version`: nothing is saved, like `dice:rolled`.
 *
 *  Example: `chatSentDto.safeParse(payload).success` */
export const chatSentDto = z.strictObject({
  campaignId: z.uuid(),
  messageId: z.uuid(),
  at: z.iso.datetime(),
  fromUserId: z.uuid(),
  channel: chatSentChannelDto,
  speaker: chatSentSpeakerDto,
  text: chatTextDto,
});
export type ChatSentDto = z.infer<typeof chatSentDto>;

/** Client → server chat events, for the Socket.IO generics on both ends. */
export type ChatClientEvents = {
  'chat:send': (command: ChatSendCommandDto, ack: (answer: ChatSendAckDto) => void) => void;
};

/** Server → client chat events. */
export type ChatServerEvents = {
  'chat:sent': (event: ChatSentDto) => void;
};
