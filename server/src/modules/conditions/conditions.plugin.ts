import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import { AssetsDao } from '../assets/assets.dao';
import type { ClockPort } from '../auth/clock.port';
import type { MembershipReader } from '../campaigns/cached-memberships';
import type { CharacterPublisherPort } from '../characters/character-publisher.port';
import { CharactersDao } from '../characters/characters.dao';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { CombatDao } from '../combat/combat.dao';
import { ScenesDao } from '../scenes/scenes.dao';
import { TokensDao } from '../tokens/tokens.dao';
import { ConditionCatalogService } from './condition-catalog.service';
import { ConditionsDao } from './conditions.dao';
import { ConditionsService, type ConditionTransactionRunner } from './conditions.service';

export type ConditionsModuleOptions = Readonly<{
  db: Database;
  /** Shared by the board modules: the memberships remembered by the campaigns module. */
  members: MembershipReader;
  publisher: BoardPublisherPort;
  /** A condition on a linked token goes out with its character. */
  characterPublisher: CharacterPublisherPort;
  clock: ClockPort;
}>;

export type ConditionsModule = Readonly<{
  service: ConditionsService;
  catalog: ConditionCatalogService;
}>;

/** Wires the conditions module; its edge is the board gateway, which receives both services.
 *
 *  Example: `const conditions = createConditionsModule({ db, members, publisher, characterPublisher, clock })` */
export function createConditionsModule(options: ConditionsModuleOptions): ConditionsModule {
  const transaction: ConditionTransactionRunner = (work) =>
    runInTransaction(options.db, (tx) =>
      work({
        scenes: new ScenesDao(tx),
        tokens: new TokensDao(tx),
        conditions: new ConditionsDao(tx),
        combat: new CombatDao(tx),
        assets: new AssetsDao(tx),
        characters: new CharactersDao(tx),
      }),
    );
  const { members } = options;
  const { publisher, characterPublisher, clock } = options;
  const reader = new ConditionsDao(options.db);
  return {
    service: new ConditionsService({ members, transaction, publisher, characterPublisher, clock }),
    catalog: new ConditionCatalogService({ members, transaction, reader, publisher, clock }),
  };
}
