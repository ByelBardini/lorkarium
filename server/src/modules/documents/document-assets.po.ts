import { boolean, foreignKey, index, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { assets } from '../assets/assets.po';
import { libraryDocuments } from './documents.po';
import { libraryDocumentTabs } from './document-tabs.po';

// One row per image and tab (0071): `in_content` false is a prepared upload, true an image the
// saved body of that tab shows. Readers get the bytes only through a confirmed row of a tab they
// see; editors also through a prepared one.
export const libraryDocumentAssets = pgTable(
  'library_document_assets',
  {
    campaignId: uuid('campaign_id').notNull(),
    documentId: uuid('document_id').notNull(),
    tabId: uuid('tab_id').notNull(),
    assetId: uuid('asset_id').notNull(),
    inContent: boolean('in_content').notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.campaignId, t.documentId, t.assetId, t.tabId] }),
    index('library_document_assets_asset_idx').on(t.campaignId, t.assetId),
    foreignKey({
      columns: [t.campaignId, t.documentId],
      foreignColumns: [libraryDocuments.campaignId, libraryDocuments.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'library_document_assets_tab_fk',
      columns: [t.campaignId, t.documentId, t.tabId],
      foreignColumns: [
        libraryDocumentTabs.campaignId,
        libraryDocumentTabs.documentId,
        libraryDocumentTabs.id,
      ],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.campaignId, t.assetId],
      foreignColumns: [assets.campaignId, assets.id],
    }).onDelete('cascade'),
  ],
);
export type DocumentAssetPo = typeof libraryDocumentAssets.$inferSelect;
