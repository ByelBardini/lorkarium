import { EFFECT_AREAS_PER_SCENE_MAX } from '@lorkarium/contracts';
import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import type { ClockPort } from '../auth/clock.port';
import { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { ScenesDao } from '../scenes/scenes.dao';
import { EffectAreasDao } from './effect-areas.dao';
import { EffectAreasService, type EffectAreaTransactionRunner } from './effect-areas.service';

export type EffectAreasModuleOptions = Readonly<{
  db: Database;
  publisher: BoardPublisherPort;
  clock: ClockPort;
}>;

export type EffectAreasModule = Readonly<{ service: EffectAreasService }>;

/** Wires the areas-of-effect module; its edge is the board gateway, which receives this service.
 *
 *  Example: `const effectAreas = createEffectAreasModule({ db, publisher, clock })` */
export function createEffectAreasModule(options: EffectAreasModuleOptions): EffectAreasModule {
  const transaction: EffectAreaTransactionRunner = (work) =>
    runInTransaction(options.db, (tx) =>
      work({ scenes: new ScenesDao(tx), effectAreas: new EffectAreasDao(tx) }),
    );
  const service = new EffectAreasService({
    members: new CampaignMembersDao(options.db),
    transaction,
    publisher: options.publisher,
    clock: options.clock,
    limit: EFFECT_AREAS_PER_SCENE_MAX,
  });
  return { service };
}
