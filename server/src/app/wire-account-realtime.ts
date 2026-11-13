import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type { Database } from '../database/database';
import { InMemoryAccountPresenceRegistry } from '../infrastructure/account-presence-registry/in-memory-account-presence-registry';
import { SocketIoAccountPresencePublisher } from '../infrastructure/account-presence-publisher/socket-io-account-presence-publisher';
import { SocketIoDirectMessagePublisher } from '../infrastructure/direct-message-publisher/socket-io-direct-message-publisher';
import { SocketIoFriendsChanged } from '../infrastructure/friends-changed/socket-io-friends-changed';
import { createAccountPresenceModule } from '../modules/account-presence/account-presence.plugin';
import type { AccountPresenceService } from '../modules/account-presence/account-presence.service';
import type { ClockPort } from '../modules/auth/clock.port';
import { CommandRateLimitedError } from '../modules/board/board.error';
import { CampaignsDao } from '../modules/campaigns/campaigns.dao';
import { createDirectMessagesModule } from '../modules/direct-messages/direct-messages.plugin';
import type { FriendsChangedPort } from '../modules/friends/friends-changed.port';
import { FriendshipsDao } from '../modules/friends/friendships.dao';
import type { SchedulerPort } from '../modules/sessions/scheduler.port';
import { CommandRateGuard } from '../realtime/command-rate-guard';
import { DM_RATE, DM_TYPING_RATE, type CommandRateLimits } from '../realtime/command-rate.bo';
import type { Realtime } from '../realtime/realtime-server';

export type AccountRealtimeWiring = Readonly<{
  db: Database;
  clock: ClockPort;
  scheduler: SchedulerPort;
  /** The bucket the session and board commands share. */
  rate: CommandRateGuard;
  log: FastifyBaseLogger;
}>;

export type AccountRealtime = Readonly<{
  /** The live table session's `TableOpenedPort`. */
  presence: AccountPresenceService;
  /** `friends:changed` to each account's room, once the direct messages and the presence forgot
   *  what they remembered of those accounts' friends. */
  friendsChanged: FriendsChangedPort;
}>;

/** Puts the account's own events on every connection, table or not: first its `user:<id>` room
 *  and presence (so it is in the room before any other gateway runs), then the direct messages
 *  with buckets of their own (`DM_RATE`, `DM_TYPING_RATE`).
 *
 *  Example: `const account = wireAccountRealtime(realtime, { db, clock, scheduler, rate, log })` */
export function wireAccountRealtime(
  realtime: Realtime,
  wiring: AccountRealtimeWiring,
): AccountRealtime {
  const { db, clock, scheduler, rate, log } = wiring;
  const friendships = new FriendshipsDao(db);
  const presence = createAccountPresenceModule({
    registry: new InMemoryAccountPresenceRegistry(),
    scheduler,
    publisher: new SocketIoAccountPresencePublisher(realtime.io),
    friendships,
    campaigns: new CampaignsDao(db),
    clock,
    realtime,
    rate,
    log,
  });
  realtime.onConnection(presence.gateway);
  const directMessages = createDirectMessagesModule({
    friendships,
    presence: presence.service,
    publisher: new SocketIoDirectMessagePublisher(realtime.io),
    clock,
    newId: randomUUID,
    realtime,
    sendRate: guardOf(clock, DM_RATE),
    typingRate: guardOf(clock, DM_TYPING_RATE),
    log,
  });
  realtime.onConnection(directMessages.gateway);
  const live = new SocketIoFriendsChanged(realtime.io);
  const friendsChanged: FriendsChangedPort = {
    friendsChanged: async (change) => {
      await directMessages.service.friendsChanged(change);
      await presence.service.friendsChanged(change);
      await live.friendsChanged(change);
    },
  };
  return { presence: presence.service, friendsChanged };
}

function guardOf(clock: ClockPort, limits: CommandRateLimits): CommandRateGuard {
  const refusal = (socketId: string, retryAfterSeconds: number): Error =>
    new CommandRateLimitedError(socketId, retryAfterSeconds);
  return new CommandRateGuard(clock, refusal, limits);
}
