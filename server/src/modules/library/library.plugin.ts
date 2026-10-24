import { SCENE_FOLDER_DEPTH_MAX } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import type { ClockPort } from '../auth/clock.port';
import { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { CampaignsDao } from '../campaigns/campaigns.dao';
import { DrawingsDao } from '../drawings/drawings.dao';
import { EffectAreasDao } from '../effect-areas/effect-areas.dao';
import { LightsDao } from '../lights/lights.dao';
import { TokensDao } from '../tokens/tokens.dao';
import { WallsDao } from '../walls/walls.dao';
import { ScenesDao } from '../scenes/scenes.dao';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import type { SceneAudiencePort } from '../scenes/scene-audience.port';
import type { LibraryPublisherPort } from './library-publisher.port';
import { libraryRoutes } from './library.routes';
import { LibraryService, type LibraryTransactionRunner } from './library.service';
import { SceneFoldersDao } from './scene-folders.dao';

export type LibraryModuleOptions = Readonly<{
  db: Database;
  publisher: LibraryPublisherPort;
  /** Takes who lost a grid (hidden, deleted) out of its rooms. */
  audience: SceneAudiencePort;
  /** Tells a renamed grid's rooms its new name (`scene:updated`). */
  grids: Pick<BoardPublisherPort, 'sceneUpdated'>;
  clock: ClockPort;
}>;

export type LibraryModule = Readonly<{ plugin: (app: FastifyInstance) => Promise<void> }>;

/** Wires the scene library: DAOs, the service and the HTTP edge. Needs `app.authGuards`.
 *
 *  Example: `const library = createLibraryModule({ db, publisher, audience, grids, clock }); await app.register(library.plugin, { prefix: '/api' })` */
export function createLibraryModule(options: LibraryModuleOptions): LibraryModule {
  const { db, publisher, audience, grids, clock } = options;
  const transaction: LibraryTransactionRunner = (work) =>
    runInTransaction(db, (tx) =>
      work({
        campaigns: new CampaignsDao(tx),
        folders: new SceneFoldersDao(tx),
        scenes: new ScenesDao(tx),
        tokens: new TokensDao(tx),
        walls: new WallsDao(tx),
        lights: new LightsDao(tx),
        drawings: new DrawingsDao(tx),
        effectAreas: new EffectAreasDao(tx),
      }),
    );
  const read = {
    campaigns: new CampaignsDao(db),
    folders: new SceneFoldersDao(db),
    scenes: new ScenesDao(db),
  };
  const members = new CampaignMembersDao(db);
  const maxFolderDepth = SCENE_FOLDER_DEPTH_MAX;
  const service = new LibraryService({
    members,
    read,
    transaction,
    publisher,
    audience,
    grids,
    clock,
    maxFolderDepth,
  });
  return { plugin: libraryRoutes(service) };
}
