import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import type { ClockPort } from '../auth/clock.port';
import type { MembershipReader } from '../campaigns/cached-memberships';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { CombatDao } from '../combat/combat.dao';
import { ScenesDao } from '../scenes/scenes.dao';
import { TokensDao } from '../tokens/tokens.dao';
import { ConditionsDao } from './conditions.dao';
import { ConditionsService, type ConditionTransactionRunner } from './conditions.service';

export type ConditionsModuleOptions = Readonly<{
  db: Database;
  /** Shared by the board modules: the memberships remembered by the campaigns module. */
  members: MembershipReader;
  publisher: BoardPublisherPort;
  clock: ClockPort;
}>;

export type ConditionsModule = Readonly<{ service: ConditionsService }>;

/** Wires the conditions module; its edge is the board gateway, which receives this service.
 *
 *  Example: `const conditions = createConditionsModule({ db, publisher, clock })` */
export function createConditionsModule(options: ConditionsModuleOptions): ConditionsModule {
  const transaction: ConditionTransactionRunner = (work) =>
    runInTransaction(options.db, (tx) =>
      work({
        scenes: new ScenesDao(tx),
        tokens: new TokensDao(tx),
        conditions: new ConditionsDao(tx),
        combat: new CombatDao(tx),
      }),
    );
  const { members } = options;
  const { publisher, clock } = options;
  return { service: new ConditionsService({ members, transaction, publisher, clock }) };
}
