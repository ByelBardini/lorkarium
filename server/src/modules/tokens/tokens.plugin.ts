import { BAR_VALUE_LIMIT } from '@lorkarium/contracts';
import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import type { ClockPort } from '../auth/clock.port';
import { AssetsDao } from '../assets/assets.dao';
import { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { CombatDao } from '../combat/combat.dao';
import { ConditionsDao } from '../conditions/conditions.dao';
import { ScenesDao } from '../scenes/scenes.dao';
import { TokensDao } from './tokens.dao';
import { TokenAppearanceService } from './token-appearance.service';
import { TokenBatchService } from './token-batch.service';
import type { TokenTransactionRunner } from './token-transaction';
import { TokensService } from './tokens.service';

export type TokensModuleOptions = Readonly<{
  db: Database;
  publisher: BoardPublisherPort;
  clock: ClockPort;
}>;

export type TokensModule = Readonly<{
  service: TokensService;
  batch: TokenBatchService;
  appearance: TokenAppearanceService;
}>;

/** Wires the tokens module (one token, and the batches of a paste); its edge is the board
 *  gateway, which receives both services.
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
        assets: new AssetsDao(tx),
      }),
    );
  const members = new CampaignMembersDao(options.db);
  const { publisher, clock } = options;
  const deps = { members, transaction, publisher, clock, barLimit: BAR_VALUE_LIMIT };
  return {
    service: new TokensService(deps),
    batch: new TokenBatchService(deps),
    appearance: new TokenAppearanceService(deps),
  };
}
