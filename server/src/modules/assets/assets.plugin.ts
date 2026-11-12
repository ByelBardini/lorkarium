import type { AssetReadPolicyPort } from './asset-read-policy.port';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import type { ClockPort } from '../auth/clock.port';
import { UsersDao } from '../auth/users.dao';
import { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { CampaignsDao } from '../campaigns/campaigns.dao';
import { AssetReferencesDao } from './asset-references.dao';
import type { AssetStoragePort } from './asset-storage.port';
import { AssetsDao } from './assets.dao';
import { assetsRoutes } from './assets.routes';
import { AssetsService, type AssetKeepTransactionRunner } from './assets.service';
import type { ImageFetcherPort } from './image-fetcher.port';
import type { ImageProcessorPort } from './image-processor.port';

export type AssetsModuleOptions = Readonly<{
  db: Database;
  storage: AssetStoragePort;
  processor: ImageProcessorPort;
  fetcher: ImageFetcherPort;
  clock: ClockPort;
  readPolicy?: AssetReadPolicyPort;
}>;

export type AssetsModule = Readonly<{
  plugin: (app: FastifyInstance) => Promise<void>;
  service: AssetsService;
}>;

/** Wires the assets module: DAOs, the service and the HTTP edge. Needs `app.authGuards`.
 *
 *  Example: `const assets = createAssetsModule(options); await app.register(assets.plugin, { prefix: '/api' })` */
export function createAssetsModule(options: AssetsModuleOptions): AssetsModule {
  const service = new AssetsService({
    members: new CampaignMembersDao(options.db),
    assets: new AssetsDao(options.db),
    tableOwners: new CampaignsDao(options.db),
    keeping: keepingOver(options.db),
    clock: options.clock,
    storage: options.storage,
    processor: options.processor,
    fetcher: options.fetcher,
    newId: randomUUID,
    readPolicy: options.readPolicy,
  });
  return { plugin: assetsRoutes(service), service };
}

function keepingOver(db: Database): AssetKeepTransactionRunner {
  return (work) =>
    runInTransaction(db, (tx) =>
      work({
        campaigns: new CampaignsDao(tx),
        owners: new UsersDao(tx),
        references: new AssetReferencesDao(tx),
        assets: new AssetsDao(tx),
      }),
    );
}
