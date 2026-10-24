import { WALL_SEGMENTS_PER_SCENE_MAX, WALLS_PER_SCENE_MAX } from '@lorkarium/contracts';
import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import type { ClockPort } from '../auth/clock.port';
import type { MembershipReader } from '../campaigns/cached-memberships';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { LightsDao } from '../lights/lights.dao';
import { ScenesDao } from '../scenes/scenes.dao';
import { TokensDao } from '../tokens/tokens.dao';
import type { SceneWallsService } from './scene-walls.service';
import { WallsDao } from './walls.dao';
import { WallsService, type WallTransactionRunner } from './walls.service';

export type WallsModuleOptions = Readonly<{
  db: Database;
  /** Shared by the board modules: the memberships remembered by the campaigns module. */
  members: MembershipReader;
  publisher: BoardPublisherPort;
  clock: ClockPort;
  /** The walls of each scene in memory, shared with the tokens module: this one forgets them. */
  sceneWalls: SceneWallsService;
}>;

export type WallsModule = Readonly<{ service: WallsService }>;

/** Wires the walls module; its edge is the board gateway, which receives this service.
 *
 *  Example: `const walls = createWallsModule({ db, publisher, clock })` */
export function createWallsModule(options: WallsModuleOptions): WallsModule {
  const transaction: WallTransactionRunner = (work) =>
    runInTransaction(options.db, (tx) =>
      work({
        scenes: new ScenesDao(tx),
        walls: new WallsDao(tx),
        tokens: new TokensDao(tx),
        lights: new LightsDao(tx),
      }),
    );
  const service = new WallsService({
    members: options.members,
    transaction,
    publisher: options.publisher,
    clock: options.clock,
    sceneWalls: options.sceneWalls,
    limits: { walls: WALLS_PER_SCENE_MAX, segments: WALL_SEGMENTS_PER_SCENE_MAX },
  });
  return { service };
}
