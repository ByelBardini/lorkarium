import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import { AssetsDao } from '../assets/assets.dao';
import type { ClockPort } from '../auth/clock.port';
import type { MembershipReader } from '../campaigns/cached-memberships';
import { CharactersDao } from '../characters/characters.dao';
import type { RoundCyclePublisherPort } from './round-cycle-publisher.port';
import { RoundCyclesDao } from './round-cycles.dao';
import { RoundCyclesService } from './round-cycles.service';

export type RoundCyclesModuleOptions = Readonly<{
  db: Database;
  /** Shared by the board modules: the memberships remembered by the campaigns module. */
  members: MembershipReader;
  publisher: RoundCyclePublisherPort;
  clock: ClockPort;
}>;

export type RoundCyclesModule = Readonly<{ service: RoundCyclesService }>;

/** Wires the round cycles; their edge is the board gateway, which receives the service.
 *
 *  Example: `const roundCycles = createRoundCyclesModule({ db, members, publisher, clock })` */
export function createRoundCyclesModule(options: RoundCyclesModuleOptions): RoundCyclesModule {
  const { db, members, publisher, clock } = options;
  const service = new RoundCyclesService({
    members,
    transaction: (work) =>
      runInTransaction(db, (tx) =>
        work({
          characters: new CharactersDao(tx),
          roundCycles: new RoundCyclesDao(tx),
          assets: new AssetsDao(tx),
        }),
      ),
    publisher,
    clock,
  });
  return { service };
}
