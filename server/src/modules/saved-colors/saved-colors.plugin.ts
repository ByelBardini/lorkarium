import { SAVED_COLORS_MAX } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import { SavedColorsDao } from './saved-colors.dao';
import { savedColorsRoutes } from './saved-colors.routes';
import { SavedColorsService, type SavedColorsTransactionRunner } from './saved-colors.service';

export type SavedColorsModuleOptions = Readonly<{ db: Database }>;

export type SavedColorsModule = Readonly<{ plugin: (app: FastifyInstance) => Promise<void> }>;

/** Wires the saved colors: DAO, service and the HTTP edge. Needs `app.authGuards`.
 *
 *  Example: `await app.register(createSavedColorsModule({ db }).plugin, { prefix: '/api' })` */
export function createSavedColorsModule(options: SavedColorsModuleOptions): SavedColorsModule {
  const { db } = options;
  const transaction: SavedColorsTransactionRunner = (work) =>
    runInTransaction(db, (tx) => work(new SavedColorsDao(tx)));
  const service = new SavedColorsService({
    colors: new SavedColorsDao(db),
    transaction,
    maxSaved: SAVED_COLORS_MAX,
  });
  return { plugin: savedColorsRoutes(service) };
}
