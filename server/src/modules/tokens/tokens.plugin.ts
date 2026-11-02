import { BAR_VALUE_LIMIT, TOKENS_PER_SCENE_MAX } from '@lorkarium/contracts';
import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import type { ClockPort } from '../auth/clock.port';
import { AssetsDao } from '../assets/assets.dao';
import type { MembershipReader } from '../campaigns/cached-memberships';
import { CampaignsDao } from '../campaigns/campaigns.dao';
import type { CharacterPublisherPort } from '../characters/character-publisher.port';
import { CharactersDao } from '../characters/characters.dao';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { CombatDao } from '../combat/combat.dao';
import { ConditionsDao } from '../conditions/conditions.dao';
import { ScenesDao } from '../scenes/scenes.dao';
import { TokenCharacterLinkDao } from './token-character-link.dao';
import { TokensDao } from './tokens.dao';
import type { SceneWallsService } from '../walls/scene-walls.service';
import { WallsDao } from '../walls/walls.dao';
import { TokenAppearanceService } from './token-appearance.service';
import { TokenFormService } from './token-form.service';
import { TokenBatchService } from './token-batch.service';
import { TokenLinkService } from './token-link.service';
import { TokenVisibilityService } from './token-visibility.service';
import type { TokenTransactionRunner } from './token-transaction';
import { TokensService } from './tokens.service';

export type TokensModuleOptions = Readonly<{
  db: Database;
  /** Shared by the board modules: the memberships remembered by the campaigns module. */
  members: MembershipReader;
  publisher: BoardPublisherPort;
  /** Where a write on a linked token's character is told (character:changed). */
  characterPublisher: CharacterPublisherPort;
  clock: ClockPort;
  /** The walls of each scene in memory, shared with the walls module (which forgets them). */
  sceneWalls: SceneWallsService;
}>;

export type TokensModule = Readonly<{
  service: TokensService;
  batch: TokenBatchService;
  appearance: TokenAppearanceService;
  form: TokenFormService;
  link: TokenLinkService;
  visibility: TokenVisibilityService;
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
        walls: new WallsDao(tx),
        characterLinks: new TokenCharacterLinkDao(tx),
        characters: new CharactersDao(tx),
      }),
    );
  const { members, publisher, characterPublisher, clock, sceneWalls } = options;
  const dragGroups = new TokensDao(options.db);
  const limits = { barLimit: BAR_VALUE_LIMIT, tokenLimit: TOKENS_PER_SCENE_MAX };
  const deps = { members, transaction, publisher, characterPublisher, clock, ...limits };
  const tokenRights = new CampaignsDao(options.db);
  const tokenDeps = { ...deps, dragGroups, sceneWalls, tokenRights };
  return {
    service: new TokensService(tokenDeps),
    batch: new TokenBatchService({ ...deps, tokenRights }),
    appearance: new TokenAppearanceService(deps),
    form: new TokenFormService(deps),
    link: new TokenLinkService(deps),
    visibility: new TokenVisibilityService(deps),
  };
}
