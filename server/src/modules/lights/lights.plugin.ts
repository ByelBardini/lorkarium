import { LIGHTS_PER_SCENE_MAX } from '@lorkarium/contracts';
import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import type { ClockPort } from '../auth/clock.port';
import type { MembershipReader } from '../campaigns/cached-memberships';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { ScenesDao } from '../scenes/scenes.dao';
import { LightsDao } from './lights.dao';
import { LightsService, type LightTransactionRunner } from './lights.service';

export type LightsModuleOptions = Readonly<{
  db: Database;
  /** Shared by the board modules: the memberships remembered by the campaigns module. */
  members: MembershipReader;
  publisher: BoardPublisherPort;
  clock: ClockPort;
}>;

export type LightsModule = Readonly<{ service: LightsService }>;

/** Wires the map lights module; its edge is the board gateway, which receives this service.
 *
 *  Example: `const lights = createLightsModule({ db, publisher, clock })` */
export function createLightsModule(options: LightsModuleOptions): LightsModule {
  const transaction: LightTransactionRunner = (work) =>
    runInTransaction(options.db, (tx) =>
      work({ scenes: new ScenesDao(tx), lights: new LightsDao(tx) }),
    );
  const service = new LightsService({
    members: options.members,
    transaction,
    publisher: options.publisher,
    clock: options.clock,
    limit: LIGHTS_PER_SCENE_MAX,
  });
  return { service };
}
