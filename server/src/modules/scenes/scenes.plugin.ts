import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import type { ClockPort } from '../auth/clock.port';
import { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import type { BoardPublisherPort } from './board-publisher.port';
import { ScenesDao } from './scenes.dao';
import { ScenesService, type SceneTransactionRunner } from './scenes.service';

export type ScenesModuleOptions = Readonly<{
  db: Database;
  publisher: BoardPublisherPort;
  clock: ClockPort;
}>;

export type ScenesModule = Readonly<{ service: ScenesService }>;

/** Wires the scenes module; its edge is the board gateway, which receives this service.
 *
 *  Example: `const scenes = createScenesModule({ db, publisher, clock })` */
export function createScenesModule(options: ScenesModuleOptions): ScenesModule {
  const transaction: SceneTransactionRunner = (work) =>
    runInTransaction(options.db, (tx) => work({ scenes: new ScenesDao(tx) }));
  const members = new CampaignMembersDao(options.db);
  const { publisher, clock } = options;
  return { service: new ScenesService({ members, transaction, publisher, clock }) };
}
