import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type { Database } from '../database/database';
import { SocketIoChatPublisher } from '../infrastructure/chat-publisher/socket-io-chat-publisher';
import { SocketIoGridAudience } from '../infrastructure/grid-audience/socket-io-grid-audience';
import type { ClockPort } from '../modules/auth/clock.port';
import { CommandRateLimitedError } from '../modules/board/board.error';
import type { MembershipReader } from '../modules/campaigns/cached-memberships';
import { createChatModule } from '../modules/chat/chat.plugin';
import { TokensDao } from '../modules/tokens/tokens.dao';
import { CommandRateGuard } from '../realtime/command-rate-guard';
import { CHAT_RATE } from '../realtime/command-rate.bo';
import type { Realtime } from '../realtime/realtime-server';

export type ChatWiring = Readonly<{
  db: Database;
  members: MembershipReader;
  clock: ClockPort;
  log: FastifyBaseLogger;
}>;

/** Puts `chat:send` on every connection: the grid rooms prove a speaking token's grid is reached,
 *  the tokens DAO reads its name and control, and the chat drains a bucket of its own
 *  (`CHAT_RATE`), apart from the board's and the dice's.
 *
 *  Example: `wireChat(realtime, { db, members, clock, log: app.log })` */
export function wireChat(realtime: Realtime, wiring: ChatWiring): void {
  const { db, members, clock, log } = wiring;
  const rate = new CommandRateGuard(
    clock,
    (socketId, retryAfterSeconds) => new CommandRateLimitedError(socketId, retryAfterSeconds),
    CHAT_RATE,
  );
  const chat = createChatModule({
    members,
    audience: new SocketIoGridAudience(realtime.io),
    tokens: new TokensDao(db),
    publisher: new SocketIoChatPublisher(realtime.io),
    clock,
    newId: randomUUID,
    realtime,
    rate,
    log,
  });
  realtime.onConnection(chat.gateway);
}
