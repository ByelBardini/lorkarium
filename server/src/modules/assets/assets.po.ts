import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../auth/users.po';
import { campaigns } from '../campaigns/campaigns.po';

export const assetPurpose = pgEnum('asset_purpose', [
  'background',
  'token',
  'cover',
  'condition',
  'aura',
  'library_image',
  'document_image',
  'library_map',
  'sheet_image',
  'sheet_template_asset',
]);
// GIF is kept only for an aura (the processor refuses it for any other purpose); a WOFF2 font only
// as an asset of a sheet template.
export const assetMimeType = pgEnum('asset_mime_type', [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'font/woff2',
]);

/** An image (or a sheet template font) of one campaign (spec §6 `Asset`); the bytes live in the
 *  S3 under `storage_key`. A font has no pixels: its width and height are 0. */
export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    // Who sent it; the image stays with the campaign when the account goes.
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    purpose: assetPurpose('purpose').notNull(),
    mimeType: assetMimeType('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    storageKey: text('storage_key').notNull(),
    // The art's cut-out in a unit square, traced at upload; null = sent before the feature or not a
    // token image. An empty list = fully transparent (blocks by the footprint).
    sightOutline:
      jsonb('sight_outline').$type<readonly (readonly (readonly [number, number])[])[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('assets_campaign_id_idx').on(table.campaignId),
    uniqueIndex('assets_campaign_id_id_unique').on(table.campaignId, table.id),
    uniqueIndex('assets_storage_key_idx').on(table.storageKey),
  ],
);

export type AssetPo = typeof assets.$inferSelect;
export type NewAssetPo = typeof assets.$inferInsert;
