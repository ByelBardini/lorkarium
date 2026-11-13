import { z } from 'zod';
import { realtimeAckFailureDto } from '../http/realtime-ack.dto';

export const PRESENCE_EVENTS = {
  sync: 'presence:sync',
  setVisibility: 'presence:setVisibility',
  friendChanged: 'presence:friendChanged',
  friendsChanged: 'friends:changed',
} as const;

/** What the account chooses; `away` is automatic (10 min idle), never chosen. */
export const presenceVisibilityDto = z.enum(['online', 'invisible']);
export type PresenceVisibilityDto = z.infer<typeof presenceVisibilityDto>;

/** What friends see: an invisible account goes out as `offline`. */
export const presenceStatusDto = z.enum(['online', 'away', 'offline']);
export type PresenceStatusDto = z.infer<typeof presenceStatusDto>;

/** The open **public** table of a friend ("Na mesa X"); a private one goes out as `null`. */
export const presenceTableDto = z.strictObject({ campaignId: z.uuid(), name: z.string() });
export type PresenceTableDto = z.infer<typeof presenceTableDto>;

/** One friend's presence in the `presence:sync` answer.
 *
 *  Example: `friendPresenceDto.parse(entry).status // 'away'` */
export const friendPresenceDto = z.strictObject({
  userId: z.uuid(),
  status: presenceStatusDto,
  table: presenceTableDto.nullable(),
});
export type FriendPresenceDto = z.infer<typeof friendPresenceDto>;

/** Answer to `presence:sync` (no payload): the presence of every friend.
 *
 *  Example: `presenceSyncAckDto.parse(answer).ok` */
export const presenceSyncAckDto = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), friends: z.array(friendPresenceDto) }),
  realtimeAckFailureDto,
]);
export type PresenceSyncAckDto = z.infer<typeof presenceSyncAckDto>;

/** `presence:setVisibility`: Online or Invisible, for every tab of the account.
 *
 *  Example: `presenceSetVisibilityCommandDto.parse({ actionId, visibility: 'invisible' })` */
export const presenceSetVisibilityCommandDto = z.strictObject({
  actionId: z.uuid(),
  visibility: presenceVisibilityDto,
});
export type PresenceSetVisibilityCommandDto = z.infer<typeof presenceSetVisibilityCommandDto>;

export const presenceSetVisibilityAckDto = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true) }),
  realtimeAckFailureDto,
]);
export type PresenceSetVisibilityAckDto = z.infer<typeof presenceSetVisibilityAckDto>;

/** `presence:friendChanged`: to the `user:<id>` room of each friend.
 *
 *  Example: `presenceFriendChangedDto.safeParse(payload).success` */
export const presenceFriendChangedDto = friendPresenceDto.extend({ at: z.iso.datetime() });
export type PresenceFriendChangedDto = z.infer<typeof presenceFriendChangedDto>;

/** `friends:changed`: the client reads `GET /api/friends` again. It never says why, so whoever
 *  was blocked only sees the friend go away.
 *
 *  Example: `friendsChangedDto.parse({ at })` */
export const friendsChangedDto = z.strictObject({ at: z.iso.datetime() });
export type FriendsChangedDto = z.infer<typeof friendsChangedDto>;

/** Client → server presence events, for the Socket.IO generics on both ends. */
export type PresenceClientEvents = {
  'presence:sync': (ack: (answer: PresenceSyncAckDto) => void) => void;
  'presence:setVisibility': (
    command: PresenceSetVisibilityCommandDto,
    ack: (answer: PresenceSetVisibilityAckDto) => void,
  ) => void;
};

/** Server → client presence and friends events. */
export type PresenceServerEvents = {
  'presence:friendChanged': (event: PresenceFriendChangedDto) => void;
  'friends:changed': (event: FriendsChangedDto) => void;
};
