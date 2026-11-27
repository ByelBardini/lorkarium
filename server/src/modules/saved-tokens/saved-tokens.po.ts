import { sql } from 'drizzle-orm';
import {
  check,
  doublePrecision,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { assets } from '../assets/assets.po';
import { campaignMembers } from '../campaigns/campaign-members.po';
import { halfCellSizeSql, tokenFrame } from '../tokens/token-columns.po';

/** The token a member saved, minus what has a column (the images and the forms), as json: the
 *  mapper writes it from the contract's body and reads it back through the same contract. */
export type SavedTokenBodyPo = Readonly<Record<string, unknown>>;

// The folders a member keeps at one table (one level), owned like the saved rolls' folders.
// Deleting one leaves its tokens out of any folder (`saved_tokens.folder_id` set null).
export const savedTokenFolders = pgTable(
  'saved_token_folders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id').notNull(),
    userId: uuid('user_id').notNull(),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'saved_token_folders_member_fk',
      columns: [table.campaignId, table.userId],
      foreignColumns: [campaignMembers.campaignId, campaignMembers.userId],
    }).onDelete('cascade'),
    uniqueIndex('saved_token_folders_member_name_unique').on(
      table.campaignId,
      table.userId,
      table.nameKey,
    ),
    check('saved_token_folders_name_length', sql`char_length(${table.name}) BETWEEN 1 AND 40`),
  ],
);

// The tokens a member keeps at one table to spawn again, seen and edited only by that member.
// The images are columns (not json) so the sweep of loose files sees them as referenced, and
// losing one gives back the initials, as on a token.
export const savedTokens = pgTable(
  'saved_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id').notNull(),
    userId: uuid('user_id').notNull(),
    folderId: uuid('folder_id').references(() => savedTokenFolders.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    imageAssetId: uuid('image_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    auraImageAssetId: uuid('aura_image_asset_id').references(() => assets.id, {
      onDelete: 'set null',
    }),
    activeForm: smallint('active_form'),
    body: jsonb('body').$type<SavedTokenBodyPo>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'saved_tokens_member_fk',
      columns: [table.campaignId, table.userId],
      foreignColumns: [campaignMembers.campaignId, campaignMembers.userId],
    }).onDelete('cascade'),
    index('saved_tokens_member_idx').on(table.campaignId, table.userId),
    // The set null of deleting a folder or an asset would scan every table without these.
    index('saved_tokens_folder_idx')
      .on(table.folderId)
      .where(sql`${table.folderId} IS NOT NULL`),
    index('saved_tokens_image_idx')
      .on(table.imageAssetId)
      .where(sql`${table.imageAssetId} IS NOT NULL`),
    index('saved_tokens_aura_image_idx')
      .on(table.auraImageAssetId)
      .where(sql`${table.auraImageAssetId} IS NOT NULL`),
    check('saved_tokens_name_length', sql`char_length(${table.name}) BETWEEN 1 AND 60`),
    check('saved_tokens_active_form_range', sql`${table.activeForm} BETWEEN 0 AND 7`),
  ],
);

// The named forms of a saved token, in order (the first is the base).
export const savedTokenForms = pgTable(
  'saved_token_forms',
  {
    savedTokenId: uuid('saved_token_id')
      .notNull()
      .references(() => savedTokens.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
    name: text('name').notNull(),
    imageAssetId: uuid('image_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    width: doublePrecision('width').notNull(),
    height: doublePrecision('height').notNull(),
    frame: tokenFrame('frame').notNull().default('square'),
  },
  (table) => [
    primaryKey({ name: 'saved_token_forms_pk', columns: [table.savedTokenId, table.position] }),
    index('saved_token_forms_image_idx')
      .on(table.imageAssetId)
      .where(sql`${table.imageAssetId} IS NOT NULL`),
    check('saved_token_forms_position_range', sql`${table.position} BETWEEN 0 AND 7`),
    check('saved_token_forms_size_half_cells', halfCellSizeSql(table.width, table.height)),
  ],
);

export type SavedTokenFolderPo = typeof savedTokenFolders.$inferSelect;
export type NewSavedTokenFolderPo = typeof savedTokenFolders.$inferInsert;
export type SavedTokenPo = typeof savedTokens.$inferSelect;
export type NewSavedTokenPo = typeof savedTokens.$inferInsert;
export type SavedTokenFormPo = typeof savedTokenForms.$inferSelect;
/** A form as a write sends it, in list order (the position comes from the order). */
export type SavedTokenFormInputPo = Omit<SavedTokenFormPo, 'savedTokenId' | 'position'>;
/** A saved token with its forms, in order. */
export type SavedTokenRow = Readonly<{ savedToken: SavedTokenPo; forms: SavedTokenFormPo[] }>;
/** What an edit saves: an absent key stays; `forms`, when present, replaces the list. */
export type SavedTokenChangesPo = Partial<
  Pick<
    SavedTokenPo,
    'name' | 'folderId' | 'imageAssetId' | 'auraImageAssetId' | 'activeForm' | 'body'
  >
>;
