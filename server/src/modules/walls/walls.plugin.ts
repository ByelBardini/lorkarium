import { WALL_SEGMENTS_PER_SCENE_MAX, WALLS_PER_SCENE_MAX } from '@lorkarium/contracts';
import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import type { ClockPort } from '../auth/clock.port';
import { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { ScenesDao } from '../scenes/scenes.dao';
import { TokensDao } from '../tokens/tokens.dao';
import { WallsDao } from './walls.dao';
import { WallsService, type WallTransactionRunner } from './walls.service';

export type WallsModuleOptions = Readonly<{
  db: Database;
  publisher: BoardPublisherPort;
  clock: ClockPort;
}>;

export type WallsModule = Readonly<{ service: WallsService }>;

/** Wires the walls module; its edge is the board gateway, which receives this service.
 *
 *  Example: `const walls = createWallsModule({ db, publisher, clock })` */
export function createWallsModule(options: WallsModuleOptions): WallsModule {
  const transaction: WallTransactionRunner = (work) =>
    runInTransaction(options.db, (tx) =>
      work({ scenes: new ScenesDao(tx), walls: new WallsDao(tx), tokens: new TokensDao(tx) }),
    );
  const service = new WallsService({
    members: new CampaignMembersDao(options.db),
    transaction,
    publisher: options.publisher,
    clock: options.clock,
    limits: { walls: WALLS_PER_SCENE_MAX, segments: WALL_SEGMENTS_PER_SCENE_MAX },
  });
  return { service };
}
