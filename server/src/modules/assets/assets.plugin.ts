import type { AssetReadPolicyPort } from './asset-read-policy.port';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import type { MembershipReader } from '../campaigns/cached-memberships';
import type { AssetStoragePort } from './asset-storage.port';
import { AssetsDao } from './assets.dao';
import { assetsRoutes } from './assets.routes';
import { AssetsService } from './assets.service';
import type { ImageFetcherPort } from './image-fetcher.port';
import type { ImageProcessorPort } from './image-processor.port';

export type AssetsModuleOptions = Readonly<{
  db: Database;
  /** The `campaigns.memberships` of the app: reading an image reads no membership again. */
  members: Pick<MembershipReader, 'findMembership'>;
  storage: AssetStoragePort;
  processor: ImageProcessorPort;
  fetcher: ImageFetcherPort;
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
    members: options.members,
    assets: new AssetsDao(options.db),
    storage: options.storage,
    processor: options.processor,
    fetcher: options.fetcher,
    newId: randomUUID,
    readPolicy: options.readPolicy,
  });
  return { plugin: assetsRoutes(service), service };
}
