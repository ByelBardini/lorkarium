import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { runInSnapshot, runInTransaction, type DatabaseExecutor } from '../../database/transaction';
import type { AssetReadPolicyPort } from '../assets/asset-read-policy.port';
import type { AssetsService } from '../assets/assets.service';
import { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { CampaignsDao } from '../campaigns/campaigns.dao';
import { SheetAssetReadPolicy } from './sheet-asset-read-policy.service';
import { SheetAssetsDao } from './sheet-assets.dao';
import { SheetHolderService } from './sheet-holder.service';
import { sheetImagesRoutes } from './sheet-images.routes';
import {
  SheetImagesService,
  type SheetImageDaos,
  type SheetImageWork,
} from './sheet-images.service';
import { SheetsDao } from './sheets.dao';

export type SheetImagesModuleOptions = Readonly<{
  db: Database;
  assets: Pick<AssetsService, 'uploadSheetImage'>;
}>;

export type SheetImagesModule = Readonly<{ plugin: (app: FastifyInstance) => Promise<void> }>;

/** Wires the upload route of the sheet images. Needs `app.authGuards`.
 *
 *  Example: `await app.register(createSheetImagesModule({ db, assets }).plugin, { prefix: '/api' })` */
export function createSheetImagesModule(options: SheetImagesModuleOptions): SheetImagesModule {
  const { db, assets } = options;
  const images = new SheetImagesService({
    snapshot: snapshotOf(db),
    transaction: (work) => runInTransaction(db, (tx) => work(sheetImageDaos(tx))),
    holders: new SheetHolderService(),
    assets,
  });
  return { plugin: sheetImagesRoutes(images) };
}

/** Who reads a `sheet_image`, for the app to compose into the assets read policy (built before
 *  the assets service, which the upload route needs).
 *
 *  Example: `createSheetAssetReadPolicy(db).canRead(userId, campaignId, assetId)` */
export function createSheetAssetReadPolicy(db: Database): AssetReadPolicyPort {
  return new SheetAssetReadPolicy(snapshotOf(db));
}

function snapshotOf(db: Database): SheetImageWork {
  return (work) => runInSnapshot(db, (tx) => work(sheetImageDaos(tx)));
}

function sheetImageDaos(executor: DatabaseExecutor): SheetImageDaos {
  return {
    members: new CampaignMembersDao(executor),
    campaigns: new CampaignsDao(executor),
    sheets: new SheetsDao(executor),
    sheetAssets: new SheetAssetsDao(executor),
  };
}
