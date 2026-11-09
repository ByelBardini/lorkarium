import { randomUUID } from 'node:crypto';
import { SCENE_FOLDER_DEPTH_MAX } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { runInSnapshot, runInTransaction, type DatabaseExecutor } from '../../database/transaction';
import { AssetsDao } from '../assets/assets.dao';
import type { ClockPort } from '../auth/clock.port';
import { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { CampaignsDao } from '../campaigns/campaigns.dao';
import { DocumentsDao } from '../documents/documents.dao';
import type { LibraryPublisherPort } from '../library/library-publisher.port';
import { SceneFoldersDao } from '../library/scene-folders.dao';
import { LibraryMapRegionsDao } from './library-map-regions.dao';
import { LibraryMapsDao } from './library-maps.dao';
import { libraryMapsRoutes } from './library-maps.routes';
import {
  LibraryMapsService,
  type LibraryMapDaos,
  type LibraryMapServiceDeps,
} from './library-maps.service';
import { MapAppearancesService } from './map-appearances.service';
import { MapLinkTargetsDao } from './map-link-targets.dao';
import { MapRegionShowService } from './map-region-show.service';
import { MapRegionsService } from './map-regions.service';

export type LibraryMapsModuleOptions = Readonly<{
  db: Database;
  publisher: Pick<LibraryPublisherPort, 'libraryChanged' | 'libraryMapChanged' | 'mapRegionShown'>;
  clock: ClockPort;
}>;

export type LibraryMapsModule = Readonly<{ plugin: (app: FastifyInstance) => Promise<void> }>;

/** The DAOs of the map library, all on one executor.
 *
 *  Example: `runInSnapshot(db, (tx) => work(libraryMapDaos(tx)))` */
export function libraryMapDaos(executor: DatabaseExecutor): LibraryMapDaos {
  return {
    campaigns: new CampaignsDao(executor),
    members: new CampaignMembersDao(executor),
    assets: new AssetsDao(executor),
    folders: new SceneFoldersDao(executor),
    maps: new LibraryMapsDao(executor),
    regions: new LibraryMapRegionsDao(executor),
    linkTargets: new MapLinkTargetsDao(executor),
    documents: new DocumentsDao(executor),
  };
}

/** Wires the map library: DAOs, the service and the HTTP edge. Needs `app.authGuards`.
 *
 *  Example: `const maps = createLibraryMapsModule({ db, publisher, clock }); await app.register(maps.plugin, { prefix: '/api' })` */
export function createLibraryMapsModule(options: LibraryMapsModuleOptions): LibraryMapsModule {
  const { db, publisher, clock } = options;
  const deps: LibraryMapServiceDeps = {
    read: libraryMapDaos(db),
    transaction: (work) => runInTransaction(db, (tx) => work(libraryMapDaos(tx))),
    snapshot: (work) => runInSnapshot(db, (tx) => work(libraryMapDaos(tx))),
    clock,
    publisher,
    newId: randomUUID,
    maxFolderDepth: SCENE_FOLDER_DEPTH_MAX,
  };
  return {
    plugin: libraryMapsRoutes({
      maps: new LibraryMapsService(deps),
      regions: new MapRegionsService(deps),
      shows: new MapRegionShowService(deps),
      appearances: new MapAppearancesService(deps),
    }),
  };
}
