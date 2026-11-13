import {
  PRESENCE_EVENTS,
  presenceSetVisibilityCommandDto,
  type ApiErrorDto,
  type FriendPresenceDto,
} from '@lorkarium/contracts';
import type { FastifyBaseLogger } from 'fastify';
import { ZodError } from 'zod';
import { invalidBodyError } from '../../lib/invalid-body';
import type { CommandRateGuard } from '../../realtime/command-rate-guard';
import { answerAck, type AckOf } from '../../realtime/realtime-ack';
import type { Realtime, RealtimeSocket } from '../../realtime/realtime-server';
import { userRoom } from '../../realtime/rooms';
import { CommandRateLimitedError } from '../board/board.error';
import { SessionEndedError } from '../sessions/sessions.error';
import type { AccountDisconnectReason } from './account-presence.bo';
import type { AccountPresenceService } from './account-presence.service';

export type AccountPresenceGatewayDeps = Readonly<{
  presence: Pick<AccountPresenceService, 'connect' | 'drop' | 'setVisibility' | 'sync'>;
  realtime: Pick<Realtime, 'reauthenticate'>;
  /** The same bucket per connection as the session and board commands. */
  rate: CommandRateGuard;
  log: FastifyBaseLogger;
}>;

// Public text only: the internal message cites ids and stays in the log.
const PUBLIC_MESSAGE: Readonly<Record<string, string>> = {
  UNAUTHENTICATED: 'A valid session is required',
  RATE_LIMITED: 'Too many commands in a row',
};

// The person asked to go (logout, closing the app) or the server ended the session: offline at
// once. Anything else is a drop that may come back within the tolerance.
const LEFT_ON_PURPOSE: ReadonlySet<string> = new Set([
  'client namespace disconnect',
  'server namespace disconnect',
]);

/** Socket.IO edge of the account's presence: every authenticated connection enters its
 *  `user:<id>` room and counts as one tab of the account, table or not; `presence:sync` answers
 *  the friends' presence, `presence:setVisibility` chooses Online or Invisible.
 *
 *  Example: `realtime.onConnection(createAccountPresenceGateway({ presence, realtime, rate, log }))` */
export function createAccountPresenceGateway(
  deps: AccountPresenceGatewayDeps,
): (socket: RealtimeSocket) => void {
  return (socket) => {
    const userId = socket.data.user.id;
    void socket.join(userRoom(userId));
    deps.presence.connect(userId, socket.id);
    const failureOf = (error: unknown): ApiErrorDto => toAckError(deps, error);
    const dropIfEnded = (error: unknown): void => {
      if (error instanceof SessionEndedError) socket.disconnect(true);
    };
    socket.on(PRESENCE_EVENTS.sync, (...args: unknown[]) => {
      const ack = args.findLast((arg) => typeof arg === 'function') as AckOf<SyncAnswer>;
      void answerAck(ack, () => syncFriends(deps, socket), failureOf, dropIfEnded);
    });
    socket.on(PRESENCE_EVENTS.setVisibility, (payload, ack) => {
      void answerAck(ack, () => setVisibility(deps, socket, payload), failureOf, dropIfEnded);
    });
    socket.on('disconnect', (reason) => deps.presence.drop(userId, socket.id, reasonOf(reason)));
  };
}

type SyncAnswer = Readonly<{ ok: true; friends: FriendPresenceDto[] }>;

async function syncFriends(
  deps: AccountPresenceGatewayDeps,
  socket: RealtimeSocket,
): Promise<SyncAnswer> {
  deps.rate.admit(socket);
  const userId = await accountOf(deps, socket);
  return { ok: true, friends: await deps.presence.sync(userId) };
}

async function setVisibility(
  deps: AccountPresenceGatewayDeps,
  socket: RealtimeSocket,
  payload: unknown,
): Promise<Readonly<{ ok: true }>> {
  deps.rate.admit(socket);
  const { visibility } = presenceSetVisibilityCommandDto.parse(payload);
  const userId = await accountOf(deps, socket);
  deps.presence.setVisibility(userId, visibility);
  return { ok: true };
}

// The session read again after the rate and the parse: never the payload (§7.3).
async function accountOf(
  deps: AccountPresenceGatewayDeps,
  socket: RealtimeSocket,
): Promise<string> {
  const user = await deps.realtime.reauthenticate(socket);
  if (!user) throw new SessionEndedError(socket.id);
  return user.id;
}

function reasonOf(reason: string): AccountDisconnectReason {
  return LEFT_ON_PURPOSE.has(reason) ? 'left' : 'dropped';
}

function toAckError(deps: AccountPresenceGatewayDeps, error: unknown): ApiErrorDto {
  if (error instanceof ZodError) return invalidBodyError(error);
  if (error instanceof CommandRateLimitedError) {
    const { code, retryAfterSeconds } = error;
    return { code, message: PUBLIC_MESSAGE[code] ?? code, retryAfterSeconds };
  }
  if (error instanceof SessionEndedError) {
    return { code: error.code, message: PUBLIC_MESSAGE[error.code] ?? error.code };
  }
  deps.log.error({ err: error }, 'unexpected error in the account presence gateway');
  return { code: 'INTERNAL_ERROR', message: 'Unexpected server error' };
}
