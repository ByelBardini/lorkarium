import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import type { ClockPort } from '../auth/clock.port';
import type { MembershipReader } from '../campaigns/cached-memberships';
import { ConditionsDao } from '../conditions/conditions.dao';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { ScenesDao } from '../scenes/scenes.dao';
import { TokensDao } from '../tokens/tokens.dao';
import { CombatDao } from './combat.dao';
import { CombatService, type CombatTransactionRunner } from './combat.service';

export type CombatModuleOptions = Readonly<{
  db: Database;
  /** Shared by the board modules: the memberships remembered by the campaigns module. */
  members: MembershipReader;
  publisher: BoardPublisherPort;
  clock: ClockPort;
}>;

export type CombatModule = Readonly<{ service: CombatService }>;

/** Wires the combat module; its edge is the board gateway, which receives this service.
 *
 *  Example: `const combat = createCombatModule({ db, publisher, clock })` */
export function createCombatModule(options: CombatModuleOptions): CombatModule {
  const transaction: CombatTransactionRunner = (work) =>
    runInTransaction(options.db, (tx) =>
      work({
        scenes: new ScenesDao(tx),
        tokens: new TokensDao(tx),
        combat: new CombatDao(tx),
        conditions: new ConditionsDao(tx),
      }),
    );
  const { members } = options;
  const { publisher, clock } = options;
  return { service: new CombatService({ members, transaction, publisher, clock }) };
}
