import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { runInSnapshot, runInTransaction, type DatabaseExecutor } from '../../database/transaction';
import type { AssetsService } from '../assets/assets.service';
import type { ClockPort } from '../auth/clock.port';
import { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { CampaignsDao } from '../campaigns/campaigns.dao';
import { SceneFoldersDao } from '../library/scene-folders.dao';
import { LibraryImagesDao } from '../library/library-images.dao';
import type { LibraryPublisherPort } from '../library/library-publisher.port';
import { DocumentsDao } from './documents.dao';
import { DocumentsService, type DocumentDaos } from './documents.service';
import { DocumentImagesService } from './document-images.service';
import { documentsRoutes } from './documents.routes';

export type DocumentsModuleOptions = Readonly<{
  db: Database;
  assets: AssetsService;
  clock: ClockPort;
  publisher: Pick<LibraryPublisherPort, 'libraryChanged'>;
}>;
export function documentDaos(executor: DatabaseExecutor): DocumentDaos {
  return {
    documents: new DocumentsDao(executor),
    campaigns: new CampaignsDao(executor),
    members: new CampaignMembersDao(executor),
    folders: new SceneFoldersDao(executor),
    images: new LibraryImagesDao(executor),
  };
}
export function createDocumentsModule(
  options: DocumentsModuleOptions,
): Readonly<{ plugin: (app: FastifyInstance) => Promise<void>; service: DocumentsService }> {
  const { db, assets, clock, publisher } = options;
  const service = new DocumentsService({
    read: documentDaos(db),
    transaction: (work) => runInTransaction(db, (tx) => work(documentDaos(tx))),
    snapshot: (work) => runInSnapshot(db, (tx) => work(documentDaos(tx))),
    clock,
    publisher,
    newId: randomUUID,
  });
  const images = new DocumentImagesService({ documents: service, assets });
  return { service, plugin: documentsRoutes(service, images) };
}
