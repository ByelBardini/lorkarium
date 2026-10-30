import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { campaigns } from '../campaigns/campaigns.po';
import { assets } from '../assets/assets.po';
import { sceneVisibility } from '../scenes/scenes.po';
import { sceneFolders } from './scene-folders.po';
export const libraryImages = pgTable(
  'library_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    folderId: uuid('folder_id'),
    assetId: uuid('asset_id').notNull(),
    name: text('name').notNull(),
    visibility: sceneVisibility('visibility').notNull().default('private'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('library_images_campaign_idx').on(t.campaignId),
    index('library_images_folder_idx').on(t.campaignId, t.folderId),
    unique('library_images_campaign_id_id_unique').on(t.campaignId, t.id),
    unique('library_images_asset_unique').on(t.assetId),
    foreignKey({
      name: 'library_images_asset_fk',
      columns: [t.campaignId, t.assetId],
      foreignColumns: [assets.campaignId, assets.id],
    }),
    foreignKey({
      name: 'library_images_folder_fk',
      columns: [t.campaignId, t.folderId],
      foreignColumns: [sceneFolders.campaignId, sceneFolders.id],
    }).onDelete('set null'),
    check('library_images_name_length', sql`char_length(${t.name}) BETWEEN 1 AND 60`),
  ],
);
export type LibraryImagePo = typeof libraryImages.$inferSelect;
export type NewLibraryImagePo = typeof libraryImages.$inferInsert;
export type LibraryImageChangesPo = Partial<
  Pick<LibraryImagePo, 'name' | 'folderId' | 'visibility'>
>;
