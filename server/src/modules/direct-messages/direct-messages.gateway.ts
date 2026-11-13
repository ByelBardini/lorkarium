import {
  DM_EVENTS,
  dmSendCommandDto,
  dmTypingCommandDto,
  type ApiErrorDto,
} from '@lorkarium/contracts';
import type { FastifyBaseLogger } from 'fastify';
import { ZodError } from 'zod';
import { invalidBodyError } from '../../lib/invalid-body';
import type { CommandRateGuard } from '../../realtime/command-rate-guard';
import { answerAck } from '../../realtime/realtime-ack';
import type { Realtime, RealtimeSocket } from '../../realtime/realtime-server';
import { CommandRateLimitedError } from '../board/board.error';
import { SessionEndedError } from '../sessions/sessions.error';
import { DirectMessageError } from './direct-messages.error';
import type { DirectMessagesService } from './direct-messages.service';

export type DirectMessagesGatewayDeps = Readonly<{
  directMessages: Pick<DirectMessagesService, 'send' | 'typing'>;
  realtime: Pick<Realtime, 'reauthenticate'>;
  /** A guard built with `DM_RATE`, apart from every other bucket. */
  sendRate: CommandRateGuard;
  /** A guard built with `DM_TYPING_RATE`. */
  typingRate: CommandRateGuard;
  log: FastifyBaseLogger;
}>;

// Public text only: the internal message cites ids and stays in the log.
const PUBLIC_MESSAGE: Readonly<Record<string, string>> = {
  DM_NOT_FRIENDS: 'You can only message your friends',
  DM_RECIPIENT_OFFLINE: 'Your friend is not online',
  DM_SENDER_INVISIBLE: 'Go online to send a message',
  UNAUTHENTICATED: 'A valid session is required',
  RATE_LIMITED: 'Too many messages in a row',
};

/** Socket.IO edge of the direct messages, on any connection (no table needed): validates the
 *  payload, re-reads the session (the sender is never the payload's, §7.3) and delegates. Nothing
 *  is written, so there is no queue; the ack of `dm:send` carries the `messageId`, while
 *  `dm:typing` has no ack and drops silently over its bucket.
 *
 *  Example: `realtime.onConnection(createDirectMessagesGateway(deps))` */
export function createDirectMessagesGateway(
  deps: DirectMessagesGatewayDeps,
): (socket: RealtimeSocket) => void {
  return (socket) => {
    const failureOf = (error: unknown): ApiErrorDto => toAckError(deps, error);
    const dropIfEnded = (error: unknown): void => {
      if (error instanceof SessionEndedError) socket.disconnect(true);
    };
    socket.on(DM_EVENTS.send, (payload, ack) => {
      void answerAck(ack, () => send(deps, socket, payload), failureOf, dropIfEnded);
    });
    socket.on(DM_EVENTS.typing, (payload) => {
      void typing(deps, socket, payload).catch((error: unknown) => {
        if (!isExpectedDrop(error)) deps.log.error({ err: error }, 'dm:typing failed');
        dropIfEnded(error);
      });
    });
  };
}

async function send(
  deps: DirectMessagesGatewayDeps,
  socket: RealtimeSocket,
  payload: unknown,
): Promise<Readonly<{ ok: true; messageId: string }>> {
  deps.sendRate.admit(socket);
  const command = dmSendCommandDto.parse(payload);
  const senderId = await senderOf(deps, socket);
  const { messageId } = await deps.directMessages.send(senderId, command);
  return { ok: true, messageId };
}

async function typing(
  deps: DirectMessagesGatewayDeps,
  socket: RealtimeSocket,
  payload: unknown,
): Promise<void> {
  deps.typingRate.admit(socket);
  const command = dmTypingCommandDto.parse(payload);
  await deps.directMessages.typing(await senderOf(deps, socket), command);
}

async function senderOf(deps: DirectMessagesGatewayDeps, socket: RealtimeSocket): Promise<string> {
  const user = await deps.realtime.reauthenticate(socket);
  if (!user) throw new SessionEndedError(socket.id);
  return user.id;
}

// What "digitando…" drops on purpose: nobody waits for an answer, so nothing is logged.
function isExpectedDrop(error: unknown): boolean {
  return (
    error instanceof ZodError ||
    error instanceof CommandRateLimitedError ||
    error instanceof SessionEndedError
  );
}

function toAckError(deps: DirectMessagesGatewayDeps, error: unknown): ApiErrorDto {
  if (error instanceof ZodError) return invalidBodyError(error);
  if (error instanceof CommandRateLimitedError) {
    const { code, retryAfterSeconds } = error;
    return { code, message: PUBLIC_MESSAGE[code] ?? code, retryAfterSeconds };
  }
  if (error instanceof DirectMessageError || error instanceof SessionEndedError) {
    return { code: error.code, message: PUBLIC_MESSAGE[error.code] ?? error.code };
  }
  deps.log.error({ err: error }, 'unexpected error in the direct messages gateway');
  return { code: 'INTERNAL_ERROR', message: 'Unexpected server error' };
}
