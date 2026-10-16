import {
  sessionCommandDto,
  type ApiErrorDto,
  type SessionCommandDto,
  type SessionJoinAckDto,
  type SessionLeaveAckDto,
  type SessionStateDto,
} from '@lorkarium/contracts';
import type { FastifyBaseLogger } from 'fastify';
import { ZodError } from 'zod';
import { invalidBodyError } from '../../lib/invalid-body';
import type { Realtime, RealtimeSocket } from '../../realtime/realtime-server';
import { campaignRoom } from '../../realtime/rooms';
import { CampaignError } from '../campaigns/campaigns.error';
import type { ConnectionTablesChange } from './connection-tables.bo';
import { SessionEndedError, SessionError } from './sessions.error';
import type { TableSessionService } from './sessions.service';

export type SessionsGatewayDeps = Readonly<{
  service: TableSessionService;
  realtime: Pick<Realtime, 'reauthenticate'>;
  log: FastifyBaseLogger;
}>;

type SessionAckFailure = Extract<SessionJoinAckDto, { ok: false }>;

type AckOf<T> = (answer: T | SessionAckFailure) => void;

// Public text only: the internal message cites ids and stays in the log.
const PUBLIC_MESSAGE: Readonly<Record<string, string>> = {
  CAMPAIGN_NOT_FOUND: 'Campaign not found',
  UNAUTHENTICATED: 'A valid session is required',
  TOO_MANY_TABLES: 'Too many open tables',
};

/** Socket.IO edge of the live table session: validates the command, re-reads the session of the
 *  connection, delegates to the service and answers in the ack. A connection may be in up to
 *  `MAX_OPEN_TABLES` tables, one room each.
 *
 *  Example: `realtime.onConnection(createSessionsGateway({ service, realtime, log }))` */
export function createSessionsGateway(deps: SessionsGatewayDeps): (socket: RealtimeSocket) => void {
  return (socket) => {
    socket.on('session:join', (payload, ack) => {
      void answer(deps, socket, ack, () => joinTable(deps, socket, payload));
    });
    socket.on('session:leave', (payload, ack) => {
      void answer(deps, socket, ack, () => leaveTable(deps, socket, payload));
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
  await socket.join(campaignRoom(campaignId));
  return { ok: true, state };
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
  // Out of the room first, so the one leaving does not hear their own memberLeft.
  void socket.leave(campaignRoom(campaignId));
  deps.service.leave(userId, campaignId, socket.id);
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

async function commandOf(
  deps: SessionsGatewayDeps,
  socket: RealtimeSocket,
  payload: unknown,
): Promise<SessionCommandDto & { userId: string }> {
  const command = sessionCommandDto.parse(payload);
  const user = await deps.realtime.reauthenticate(socket);
  if (!user) throw new SessionEndedError(socket.id);
  return { ...command, userId: user.id };
}

async function answer<T>(
  deps: SessionsGatewayDeps,
  socket: RealtimeSocket,
  ack: AckOf<T> | undefined,
  work: () => Promise<T>,
): Promise<void> {
  try {
    reply(ack, await work());
  } catch (error) {
    reply(ack, { ok: false, error: toAckError(deps, error) });
    if (error instanceof SessionEndedError) socket.disconnect(true);
  }
}

// A client may emit without an ack callback; there is nothing to answer then.
function reply<T>(ack: AckOf<T> | undefined, body: Parameters<AckOf<T>>[0]): void {
  if (typeof ack === 'function') ack(body);
}

function toAckError(deps: SessionsGatewayDeps, error: unknown): ApiErrorDto {
  if (error instanceof ZodError) return invalidBodyError(error);
  if (error instanceof CampaignError || error instanceof SessionError) {
    const message = PUBLIC_MESSAGE[error.code];
    if (message) return { code: error.code, message };
  }
  deps.log.error({ err: error }, 'unexpected error in the sessions gateway');
  return { code: 'INTERNAL_ERROR', message: 'Unexpected server error' };
}
