import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import type { ClockPort } from '../auth/clock.port';
import type { MembershipReader } from '../campaigns/cached-memberships';
import type { CharacterPublisherPort } from '../characters/character-publisher.port';
import { CharactersDao } from '../characters/characters.dao';
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
  /** The conditions a turn counts down on a character go out with it. */
  characterPublisher: CharacterPublisherPort;
  clock: ClockPort;
}>;

export type CombatModule = Readonly<{ service: CombatService }>;

/** Wires the combat module; its edge is the board gateway, which receives this service.
 *
 *  Example: `const combat = createCombatModule({ db, members, publisher, characterPublisher, clock })` */
export function createCombatModule(options: CombatModuleOptions): CombatModule {
  const transaction: CombatTransactionRunner = (work) =>
    runInTransaction(options.db, (tx) =>
      work({
        scenes: new ScenesDao(tx),
        tokens: new TokensDao(tx),
        combat: new CombatDao(tx),
        conditions: new ConditionsDao(tx),
        characters: new CharactersDao(tx),
      }),
    );
  const { members } = options;
  const { publisher, characterPublisher, clock } = options;
  const deps = { members, transaction, publisher, characterPublisher, clock };
  return { service: new CombatService(deps) };
}
