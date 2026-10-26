import { SAVED_ROLLS_MAX } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { SavedRollsDao } from './saved-rolls.dao';
import { savedRollsRoutes } from './saved-rolls.routes';
import { SavedRollsService, type SavedRollsTransactionRunner } from './saved-rolls.service';

export type SavedRollsModuleOptions = Readonly<{ db: Database }>;

export type SavedRollsModule = Readonly<{ plugin: (app: FastifyInstance) => Promise<void> }>;

/** Wires the saved rolls: DAOs, the service and the HTTP edge. Needs `app.authGuards`.
 *
 *  Example: `const savedRolls = createSavedRollsModule({ db }); await app.register(savedRolls.plugin, { prefix: '/api' })` */
export function createSavedRollsModule(options: SavedRollsModuleOptions): SavedRollsModule {
  const { db } = options;
  const transaction: SavedRollsTransactionRunner = (work) =>
    runInTransaction(db, (tx) => work({ rolls: new SavedRollsDao(tx) }));
  const service = new SavedRollsService({
    members: new CampaignMembersDao(db),
    rolls: new SavedRollsDao(db),
    transaction,
    maxSaved: SAVED_ROLLS_MAX,
  });
  return { plugin: savedRollsRoutes(service) };
}
