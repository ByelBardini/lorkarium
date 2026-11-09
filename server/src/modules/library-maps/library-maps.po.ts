import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { assets } from '../assets/assets.po';
import { campaigns } from '../campaigns/campaigns.po';
import { sceneFolders } from '../library/scene-folders.po';
import { sceneVisibility } from '../scenes/scenes.po';

export const libraryMaps = pgTable(
  'library_maps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    folderId: uuid('folder_id'),
    assetId: uuid('asset_id').notNull(),
    name: text('name').notNull(),
    visibility: sceneVisibility('visibility').notNull().default('private'),
    isMain: boolean('is_main').notNull().default(false),
    version: integer('version').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('library_maps_campaign_id_id_unique').on(t.campaignId, t.id),
    unique('library_maps_asset_unique').on(t.assetId),
    index('library_maps_folder_idx').on(t.campaignId, t.folderId),
    // One main map per campaign, held by the database so `campaigns` needs no column for it.
    uniqueIndex('library_maps_one_main_unique')
      .on(t.campaignId)
      .where(sql`${t.isMain}`),
    foreignKey({
      name: 'library_maps_asset_fk',
      columns: [t.campaignId, t.assetId],
      foreignColumns: [assets.campaignId, assets.id],
    }),
    // The migration narrows it to SET NULL ("folder_id"): campaign_id must survive the folder.
    foreignKey({
      name: 'library_maps_folder_fk',
      columns: [t.campaignId, t.folderId],
      foreignColumns: [sceneFolders.campaignId, sceneFolders.id],
    }).onDelete('set null'),
    check('library_maps_name_length', sql`char_length(${t.name}) BETWEEN 1 AND 60`),
    check('library_maps_version_nonnegative', sql`${t.version} >= 0`),
  ],
);

export type LibraryMapPo = typeof libraryMaps.$inferSelect;
export type NewLibraryMapPo = typeof libraryMaps.$inferInsert;
/** What editing a map changes: an absent key stays. The image of a map never changes. */
export type LibraryMapChangesPo = Partial<Pick<LibraryMapPo, 'name' | 'folderId' | 'visibility'>>;
