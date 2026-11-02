import { SAVED_ROLL_FOLDERS_MAX, SAVED_ROLLS_MAX } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { SavedRollFoldersDao } from './saved-roll-folders.dao';
import { SavedRollFoldersService } from './saved-roll-folders.service';
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
    runInTransaction(db, (tx) =>
      work({ rolls: new SavedRollsDao(tx), folders: new SavedRollFoldersDao(tx) }),
    );
  const members = new CampaignMembersDao(db);
  const folders = new SavedRollFoldersDao(db);
  const service = new SavedRollsService({
    members,
    rolls: new SavedRollsDao(db),
    folders,
    transaction,
    maxSaved: SAVED_ROLLS_MAX,
  });
  const folderService = new SavedRollFoldersService({
    members,
    folders,
    transaction,
    maxFolders: SAVED_ROLL_FOLDERS_MAX,
  });
  return { plugin: savedRollsRoutes(service, folderService) };
}
