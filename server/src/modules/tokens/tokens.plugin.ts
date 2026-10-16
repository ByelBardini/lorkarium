import { BAR_VALUE_LIMIT } from '@lorkarium/contracts';
import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import type { ClockPort } from '../auth/clock.port';
import { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { CombatDao } from '../combat/combat.dao';
import { ConditionsDao } from '../conditions/conditions.dao';
import { ScenesDao } from '../scenes/scenes.dao';
import { TokensDao } from './tokens.dao';
import { TokensService, type TokenTransactionRunner } from './tokens.service';

export type TokensModuleOptions = Readonly<{
  db: Database;
  publisher: BoardPublisherPort;
  clock: ClockPort;
}>;

export type TokensModule = Readonly<{ service: TokensService }>;

/** Wires the tokens module; its edge is the board gateway, which receives this service.
 *
 *  Example: `const tokens = createTokensModule({ db, publisher, clock })` */
export function createTokensModule(options: TokensModuleOptions): TokensModule {
  const transaction: TokenTransactionRunner = (work) =>
    runInTransaction(options.db, (tx) =>
      work({
        scenes: new ScenesDao(tx),
        tokens: new TokensDao(tx),
        conditions: new ConditionsDao(tx),
        combat: new CombatDao(tx),
      }),
    );
  const members = new CampaignMembersDao(options.db);
  const { publisher, clock } = options;
  const service = new TokensService({
    members,
    transaction,
    publisher,
    clock,
    barLimit: BAR_VALUE_LIMIT,
  });
  return { service };
}
