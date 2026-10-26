import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type { Database } from '../database/database';
import { CannonDicePhysics } from '../infrastructure/dice-physics/cannon-dice-physics';
import { SocketIoDicePublisher } from '../infrastructure/dice-publisher/socket-io-dice-publisher';
import { CryptoDiceRandom } from '../infrastructure/dice-random/crypto-dice-random';
import type { ClockPort } from '../modules/auth/clock.port';
import { CommandRateLimitedError } from '../modules/board/board.error';
import type { MembershipReader } from '../modules/campaigns/cached-memberships';
import { createDiceModule } from '../modules/dice/dice.plugin';
import { ProfilesDao } from '../modules/profiles/profiles.dao';
import { CommandRateGuard } from '../realtime/command-rate-guard';
import { DICE_RATE } from '../realtime/command-rate.bo';
import type { Realtime } from '../realtime/realtime-server';

export type DiceWiring = Readonly<{
  db: Database;
  members: MembershipReader;
  clock: ClockPort;
  log: FastifyBaseLogger;
}>;

/** Puts `dice:roll` on every connection: crypto feeds the physics and draws the dice without a
 *  model, and the dice drain a bucket of their own (`DICE_RATE`), apart from the board's.
 *
 *  Example: `wireDice(realtime, { db, members, clock, log: app.log })` */
export function wireDice(realtime: Realtime, wiring: DiceWiring): void {
  const { db, members, clock, log } = wiring;
  const random = new CryptoDiceRandom();
  const rate = new CommandRateGuard(
    clock,
    (socketId, retryAfterSeconds) => new CommandRateLimitedError(socketId, retryAfterSeconds),
    DICE_RATE,
  );
  const dice = createDiceModule({
    members,
    profiles: new ProfilesDao(db),
    physics: new CannonDicePhysics(random),
    random,
    publisher: new SocketIoDicePublisher(realtime.io),
    clock,
    newId: randomUUID,
    realtime,
    rate,
    log,
  });
  realtime.onConnection(dice.gateway);
}
