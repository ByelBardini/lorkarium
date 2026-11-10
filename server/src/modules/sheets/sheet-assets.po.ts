import { foreignKey, index, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { assets } from '../assets/assets.po';
import { tokenSheets } from './sheets.po';

// One row per image and sheet: who reads the sheet reads the image, and nobody else. Deleting
// the sheet drops its rows, so the image stops being served (the asset itself stays).
export const sheetAssets = pgTable(
  'sheet_assets',
  {
    campaignId: uuid('campaign_id').notNull(),
    sheetId: uuid('sheet_id').notNull(),
    assetId: uuid('asset_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.campaignId, t.sheetId, t.assetId] }),
    index('sheet_assets_asset_idx').on(t.campaignId, t.assetId),
    foreignKey({
      name: 'sheet_assets_sheet_fk',
      columns: [t.campaignId, t.sheetId],
      foreignColumns: [tokenSheets.campaignId, tokenSheets.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'sheet_assets_asset_fk',
      columns: [t.campaignId, t.assetId],
      foreignColumns: [assets.campaignId, assets.id],
    }).onDelete('cascade'),
  ],
);

export type SheetAssetPo = typeof sheetAssets.$inferSelect;
