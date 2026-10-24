import { DRAWINGS_PER_SCENE_MAX } from '@lorkarium/contracts';
import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import type { ClockPort } from '../auth/clock.port';
import type { MembershipReader } from '../campaigns/cached-memberships';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { ScenesDao } from '../scenes/scenes.dao';
import { DrawingsDao } from './drawings.dao';
import { DrawingsService, type DrawingTransactionRunner } from './drawings.service';

export type DrawingsModuleOptions = Readonly<{
  db: Database;
  /** Shared by the board modules: the memberships remembered by the campaigns module. */
  members: MembershipReader;
  publisher: BoardPublisherPort;
  clock: ClockPort;
}>;

export type DrawingsModule = Readonly<{ service: DrawingsService }>;

/** Wires the drawings module; its edge is the board gateway, which receives this service.
 *
 *  Example: `const drawings = createDrawingsModule({ db, publisher, clock })` */
export function createDrawingsModule(options: DrawingsModuleOptions): DrawingsModule {
  const transaction: DrawingTransactionRunner = (work) =>
    runInTransaction(options.db, (tx) =>
      work({ scenes: new ScenesDao(tx), drawings: new DrawingsDao(tx) }),
    );
  const service = new DrawingsService({
    members: options.members,
    transaction,
    publisher: options.publisher,
    clock: options.clock,
    limit: DRAWINGS_PER_SCENE_MAX,
  });
  return { service };
}
