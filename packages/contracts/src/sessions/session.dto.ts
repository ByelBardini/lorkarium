import { z } from 'zod';
import { campaignRoleDto } from '../campaigns/campaign.dto';
import { realtimeAckFailureDto, stateVersionDto } from '../http/realtime-ack.dto';

/** Socket.IO path: under `/api` like every route, so the Vite proxy and production share it. */
export const REALTIME_PATH = '/api/socket.io';

/** Tables one connection may have open at once. Caps the presence the server keeps per
 *  connection, and still fits the rail without scrolling. */
export const MAX_OPEN_TABLES = 5;

/** Live table session event names (spec §7.2); the campaign itself is the session. */
export const SESSION_EVENTS = {
  join: 'session:join',
  leave: 'session:leave',
  memberJoined: 'session:memberJoined',
  memberLeft: 'session:memberLeft',
} as const;

/** Payload of `session:join` and `session:leave`; who asks comes from the connection (§7.3).
 *
 *  Example: `sessionCommandDto.parse({ actionId: crypto.randomUUID(), campaignId })` */
export const sessionCommandDto = z.strictObject({
  actionId: z.uuid(),
  campaignId: z.uuid(),
});

export type SessionCommandDto = z.infer<typeof sessionCommandDto>;

export const sessionMemberDto = z.strictObject({
  userId: z.uuid(),
  name: z.string(),
  role: campaignRoleDto,
  online: z.boolean(),
});

export type SessionMemberDto = z.infer<typeof sessionMemberDto>;

/** Snapshot of who is at the table (the `session:state` of §7.2), sent as the join ack.
 *
 *  Example: `sessionStateDto.parse(ack.state).members.filter((m) => m.online)` */
export const sessionStateDto = z.strictObject({
  campaignId: z.uuid(),
  version: stateVersionDto,
  members: z.array(sessionMemberDto),
  at: z.iso.datetime(),
});

export type SessionStateDto = z.infer<typeof sessionStateDto>;

export const sessionMemberJoinedDto = z.strictObject({
  campaignId: z.uuid(),
  version: stateVersionDto,
  member: sessionMemberDto.extend({ online: z.literal(true) }),
  at: z.iso.datetime(),
});

export type SessionMemberJoinedDto = z.infer<typeof sessionMemberJoinedDto>;

export const sessionMemberLeftDto = z.strictObject({
  campaignId: z.uuid(),
  version: stateVersionDto,
  userId: z.uuid(),
  at: z.iso.datetime(),
});

export type SessionMemberLeftDto = z.infer<typeof sessionMemberLeftDto>;

/** Answer to `session:join`: the snapshot, or the same error body as the HTTP API. */
export const sessionJoinAckDto = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), state: sessionStateDto }),
  realtimeAckFailureDto,
]);

export type SessionJoinAckDto = z.infer<typeof sessionJoinAckDto>;

/** Answer to `session:leave`; leaving twice is still `ok`. */
export const sessionLeaveAckDto = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true) }),
  realtimeAckFailureDto,
]);

export type SessionLeaveAckDto = z.infer<typeof sessionLeaveAckDto>;

/** Client → server events, for the Socket.IO generics on both ends. */
export type SessionClientEvents = {
  'session:join': (command: SessionCommandDto, ack: (answer: SessionJoinAckDto) => void) => void;
  'session:leave': (command: SessionCommandDto, ack: (answer: SessionLeaveAckDto) => void) => void;
};

/** Server → room events, for the Socket.IO generics on both ends. */
export type SessionServerEvents = {
  'session:memberJoined': (event: SessionMemberJoinedDto) => void;
  'session:memberLeft': (event: SessionMemberLeftDto) => void;
};
