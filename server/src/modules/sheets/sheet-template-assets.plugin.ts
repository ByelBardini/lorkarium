import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { runInSnapshot, type DatabaseExecutor } from '../../database/transaction';
import type { AssetReadPolicyPort } from '../assets/asset-read-policy.port';
import type { AssetsService } from '../assets/assets.service';
import { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { CampaignsDao } from '../campaigns/campaigns.dao';
import { SheetAssetsDao } from './sheet-assets.dao';
import {
  SheetTemplateAssetReadPolicy,
  type SheetTemplateAssetReadDaos,
} from './sheet-template-asset-read-policy.service';
import { sheetTemplateAssetsRoutes } from './sheet-template-assets.routes';
import { SheetTemplateAssetsService } from './sheet-template-assets.service';
import { SheetTemplatesDao } from './sheet-templates.dao';
import { SheetsDao } from './sheets.dao';

export type SheetTemplateAssetsModuleOptions = Readonly<{
  db: Database;
  assets: Pick<AssetsService, 'uploadSheetTemplateAsset'>;
}>;

export type SheetTemplateAssetsModule = Readonly<{
  plugin: (app: FastifyInstance) => Promise<void>;
}>;

/** Wires the upload route of the template fonts and images. Needs `app.authGuards`.
 *
 *  Example: `await app.register(createSheetTemplateAssetsModule({ db, assets }).plugin, { prefix: '/api' })` */
export function createSheetTemplateAssetsModule(
  options: SheetTemplateAssetsModuleOptions,
): SheetTemplateAssetsModule {
  const { db, assets } = options;
  const service = new SheetTemplateAssetsService({ members: new CampaignMembersDao(db), assets });
  return { plugin: sheetTemplateAssetsRoutes(service) };
}

/** Who reads a `sheet_template_asset`, for the app to compose into the assets read policy (built
 *  before the assets service, which the upload route needs).
 *
 *  Example: `createSheetTemplateAssetReadPolicy(db).canRead(userId, campaignId, assetId)` */
export function createSheetTemplateAssetReadPolicy(db: Database): AssetReadPolicyPort {
  return new SheetTemplateAssetReadPolicy((work) => runInSnapshot(db, (tx) => work(readDaos(tx))));
}

function readDaos(executor: DatabaseExecutor): SheetTemplateAssetReadDaos {
  return {
    members: new CampaignMembersDao(executor),
    campaigns: new CampaignsDao(executor),
    sheets: new SheetsDao(executor),
    sheetAssets: new SheetAssetsDao(executor),
    templates: new SheetTemplatesDao(executor),
  };
}
