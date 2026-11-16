import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import type { AssetStoragePort } from '../assets/asset-storage.port';
import { UsersDao } from '../auth/users.dao';
import type { AvatarProcessorPort } from '../profiles/avatar-processor.port';
import { BadgesDao } from './badges.dao';
import { badgesRoutes } from './badges.routes';
import { BadgesService, type BadgesTransactionRunner } from './badges.service';

export type BadgesModuleOptions = Readonly<{
  db: Database;
  /** The same bucket as the assets; badge images live under `badges/`. */
  storage: AssetStoragePort;
  /** The profile photo's processor: a badge is a still 128 square cut by the crop. */
  processor: AvatarProcessorPort;
}>;

export type BadgesModule = Readonly<{
  plugin: (app: FastifyInstance) => Promise<void>;
  /** Answers the badges an account shows (the profiles' `AccountBadgesPort`). */
  service: BadgesService;
}>;

/** Wires the badges: DAO, service and the HTTP edge (catalog and grants for an admin, the image
 *  for any session). Needs `app.authGuards`.
 *
 *  Example: `await app.register(createBadgesModule({ db, storage, processor }).plugin, { prefix: '/api' })` */
export function createBadgesModule(options: BadgesModuleOptions): BadgesModule {
  const transaction: BadgesTransactionRunner = (work) =>
    runInTransaction(options.db, (tx) =>
      work({ badges: new BadgesDao(tx), accounts: new UsersDao(tx) }),
    );
  const service = new BadgesService({
    badges: new BadgesDao(options.db),
    accounts: new UsersDao(options.db),
    transaction,
    storage: options.storage,
    processor: options.processor,
    newId: randomUUID,
  });
  return { plugin: badgesRoutes(service), service };
}
