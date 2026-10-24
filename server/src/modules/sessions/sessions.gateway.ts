import {
  sessionActivityCommandDto,
  sessionCommandDto,
  type ApiErrorDto,
  type SessionActivityAckDto,
  type SessionCommandDto,
  type SessionJoinAckDto,
  type SessionLeaveAckDto,
  type SessionStateDto,
} from '@lorkarium/contracts';
import type { FastifyBaseLogger } from 'fastify';
import { ZodError, type z } from 'zod';
import { invalidBodyError } from '../../lib/invalid-body';
import type { CommandRateGuard } from '../../realtime/command-rate-guard';
import { answerAck } from '../../realtime/realtime-ack';
import type { Realtime, RealtimeSocket } from '../../realtime/realtime-server';
import {
  campaignMastersRoom,
  campaignRoom,
  campaignUserRoom,
  isRoomOfCampaign,
  sceneAudienceRooms,
  type TableAudience,
} from '../../realtime/rooms';
import { withoutWatchedTable } from '../../realtime/watched-scenes';
import { CommandRateLimitedError } from '../board/board.error';
import { CampaignError } from '../campaigns/campaigns.error';
import type { SceneWatchService } from '../scenes/scene-watch.service';
import type { ConnectionTablesChange } from './connection-tables.bo';
import { SessionEndedError, SessionError } from './sessions.error';
import type { TableSessionService } from './sessions.service';

export type SessionsGatewayDeps = Readonly<{
  service: TableSessionService;
  /** The group grid and the cast a join enters: everyone at the table has both open. */
  groupGrid: Pick<SceneWatchService, 'groupSceneIdOf' | 'castSceneIdOf'>;
  realtime: Pick<Realtime, 'reauthenticate'>;
  rate: CommandRateGuard;
  log: FastifyBaseLogger;
}>;

// Public text only: the internal message cites ids and stays in the log.
const PUBLIC_MESSAGE: Readonly<Record<string, string>> = {
  CAMPAIGN_NOT_FOUND: 'Campaign not found',
  UNAUTHENTICATED: 'A valid session is required',
  TOO_MANY_TABLES: 'Too many open tables',
  RATE_LIMITED: 'Too many commands in a row',
};

/** Socket.IO edge of the live table session: validates the command, re-reads the session of the
 *  connection, delegates to the service and answers in the ack. A connection may be in up to
 *  `MAX_OPEN_TABLES` tables, one room each.
 *
 *  Example: `realtime.onConnection(createSessionsGateway({ service, realtime, log }))` */
export function createSessionsGateway(deps: SessionsGatewayDeps): (socket: RealtimeSocket) => void {
  return (socket) => {
    const failureOf = (error: unknown): ApiErrorDto => toAckError(deps, error);
    const dropIfEnded = (error: unknown): void => {
      if (error instanceof SessionEndedError) socket.disconnect(true);
    };
    socket.on('session:join', (payload, ack) => {
      void answerAck(ack, () => joinTable(deps, socket, payload), failureOf, dropIfEnded);
    });
    socket.on('session:leave', (payload, ack) => {
      void answerAck(ack, () => leaveTable(deps, socket, payload), failureOf, dropIfEnded);
    });
    socket.on('session:setActivity', (payload, ack) => {
      void answerAck(ack, () => setActivity(deps, socket, payload), failureOf, dropIfEnded);
    });
    socket.on('disconnect', () => dropTables(deps, socket));
  };
}

type TableCommand = Readonly<{ userId: string; campaignId: string }>;

async function joinTable(
  deps: SessionsGatewayDeps,
  socket: RealtimeSocket,
  payload: unknown,
): Promise<Extract<SessionJoinAckDto, { ok: true }>> {
  const { campaignId, userId } = await commandOf(deps, socket, payload);
  const admission = deps.service.admitTable(socket.data.campaignIds, campaignId);
  // Reserved before the await: six joins at once must not all pass the limit check.
  socket.data.campaignIds = admission.tables;
  const state = await joinOrRelease(deps, socket, { userId, campaignId }, admission.change);
  // The socket may have gone while the roster was read; it must not stay online in the roster.
  if (socket.disconnected) {
    deps.service.drop(userId, campaignId, socket.id);
    return { ok: true, state };
  }
  // A leave of this table arrived while the roster was read: it already gave the slot back.
  if (!socket.data.campaignIds.has(campaignId)) {
    deps.service.leave(userId, campaignId, socket.id);
    return { ok: true, state };
  }
  const audience = audienceIn(state, userId);
  await socket.join(audienceRoomsOf(campaignId, userId, audience));
  await enterTableGrids(deps, socket, { userId, campaignId }, audience);
  return { ok: true, state };
}

// Someone missing from the snapshot gets the rooms that see the least (deny by default).
function audienceIn(state: SessionStateDto, userId: string): TableAudience {
  return state.members.find((member) => member.userId === userId)?.role ?? 'spectator';
}

// The table room for everyone, plus the rooms that receive the unredacted board (§3.9); the
// spectator stays out of their own room, so a control kept from before a demotion is inert.
function audienceRoomsOf(campaignId: string, userId: string, audience: TableAudience): string[] {
  const rooms = [campaignRoom(campaignId)];
  if (audience === 'spectator') return rooms;
  rooms.push(campaignUserRoom(campaignId, userId));
  if (audience === 'master') rooms.push(campaignMastersRoom(campaignId));
  return rooms;
}

// Read only once the socket is in the table room: a group grid changed after this read moves
// everyone in that room, this socket included. The cast never changes.
async function enterTableGrids(
  deps: SessionsGatewayDeps,
  socket: RealtimeSocket,
  { userId, campaignId }: TableCommand,
  audience: TableAudience,
): Promise<void> {
  const groupSceneId = await deps.groupGrid.groupSceneIdOf(campaignId);
  const castSceneId = await deps.groupGrid.castSceneIdOf(campaignId);
  // A leave (or a drop) during the read already left the table: it must not re-enter a grid.
  if (socket.disconnected || !socket.data.campaignIds.has(campaignId)) return;
  const sceneIds = [groupSceneId, castSceneId].filter((id): id is string => id !== null);
  const rooms = sceneIds.flatMap((id) => sceneAudienceRooms(campaignId, id, userId, audience));
  if (rooms.length > 0) await socket.join(rooms);
}

async function joinOrRelease(
  deps: SessionsGatewayDeps,
  socket: RealtimeSocket,
  { userId, campaignId }: TableCommand,
  change: ConnectionTablesChange,
): Promise<SessionStateDto> {
  try {
    return await deps.service.join(userId, campaignId, socket.id);
  } catch (error) {
    if (change === 'admitted') releaseSlot(deps, socket, campaignId);
    throw error;
  }
}

async function leaveTable(
  deps: SessionsGatewayDeps,
  socket: RealtimeSocket,
  payload: unknown,
): Promise<Extract<SessionLeaveAckDto, { ok: true }>> {
  const { campaignId, userId } = await commandOf(deps, socket, payload);
  if (!releaseSlot(deps, socket, campaignId)) return { ok: true };
  // Out of the rooms first (the table's and its grids'), so the one leaving does not hear their
  // own memberLeft.
  for (const room of [...socket.rooms]) {
    if (isRoomOfCampaign(room, campaignId)) void socket.leave(room);
  }
  socket.data.watchedSceneIds = withoutWatchedTable(socket.data.watchedSceneIds, campaignId);
  deps.service.leave(userId, campaignId, socket.id);
  return { ok: true };
}

// A table not open on this connection has nothing to mark: `ok`, and no room hears of it.
async function setActivity(
  deps: SessionsGatewayDeps,
  socket: RealtimeSocket,
  payload: unknown,
): Promise<Extract<SessionActivityAckDto, { ok: true }>> {
  const { campaignId, userId, away } = await commandOf(
    deps,
    socket,
    payload,
    sessionActivityCommandDto,
  );
  if (!socket.data.campaignIds.has(campaignId)) return { ok: true };
  deps.service.setActivity(userId, campaignId, socket.id, away);
  return { ok: true };
}

function releaseSlot(
  deps: SessionsGatewayDeps,
  socket: RealtimeSocket,
  campaignId: string,
): boolean {
  const release = deps.service.releaseTable(socket.data.campaignIds, campaignId);
  socket.data.campaignIds = release.tables;
  return release.change === 'released';
}

function dropTables(deps: SessionsGatewayDeps, socket: RealtimeSocket): void {
  const { campaignIds, user } = socket.data;
  for (const campaignId of campaignIds) deps.service.drop(user.id, campaignId, socket.id);
}

async function commandOf<C extends SessionCommandDto = SessionCommandDto>(
  deps: SessionsGatewayDeps,
  socket: RealtimeSocket,
  payload: unknown,
  schema: z.ZodType<C> = sessionCommandDto as z.ZodType<C>,
): Promise<C & { userId: string }> {
  // The rate comes first: a flood is refused before it costs a parse or a session read.
  deps.rate.admit(socket);
  const command = schema.parse(payload);
  const user = await deps.realtime.reauthenticate(socket);
  if (!user) throw new SessionEndedError(socket.id);
  return { ...command, userId: user.id };
}

function toAckError(deps: SessionsGatewayDeps, error: unknown): ApiErrorDto {
  if (error instanceof ZodError) return invalidBodyError(error);
  if (error instanceof CommandRateLimitedError) {
    const { code, retryAfterSeconds } = error;
    return { code, message: PUBLIC_MESSAGE[code] ?? code, retryAfterSeconds };
  }
  if (error instanceof CampaignError || error instanceof SessionError) {
    const message = PUBLIC_MESSAGE[error.code];
    if (message) return { code: error.code, message };
  }
  deps.log.error({ err: error }, 'unexpected error in the sessions gateway');
  return { code: 'INTERNAL_ERROR', message: 'Unexpected server error' };
}
