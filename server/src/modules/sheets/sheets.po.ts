import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  type PgTableExtraConfigValue,
} from 'drizzle-orm/pg-core';
import { campaigns } from '../campaigns/campaigns.po';
import { characters } from '../characters/characters.po';
import { sceneFolders } from '../library/scene-folders.po';
import { tokens } from '../tokens/tokens.po';
import { sheetTemplates } from './sheet-templates.po';

/** A value of a sheet as JSONB keeps it: the shape the contract's budget let in. */
export type SheetValuePo =
  string | number | boolean | null | SheetValuePo[] | { [key: string]: SheetValuePo };
export type SheetValuesPo = Record<string, SheetValuePo>;

// The order of the contract's `sheetVisibilityDto`.
export const sheetVisibility = pgEnum('sheet_visibility', ['controllers', 'table']);

export const tokenSheets = pgTable(
  'token_sheets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id').notNull(),
    name: text('name').notNull(),
    folderId: uuid('folder_id'),
    // The token that holds it (a character's is its anchor, in the cast); null = nobody's. Many
    // sheets per token; losing the token leaves the sheet in the library, without a holder.
    tokenId: uuid('token_id').references(() => tokens.id, { onDelete: 'set null' }),
    // The character that holds it, in place of a token (at most one of the two, CHECK
    // token_sheets_one_holder); losing the character leaves the sheet without a holder.
    characterId: uuid('character_id'),
    visibility: sheetVisibility('visibility').notNull().default('controllers'),
    values: jsonb('values').$type<SheetValuesPo>().notNull().default({}),
    version: integer('version').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t): PgTableExtraConfigValue[] => [
    unique('token_sheets_campaign_id_id_unique').on(t.campaignId, t.id),
    index('token_sheets_template_idx').on(t.campaignId, t.templateId),
    index('token_sheets_token_idx').on(t.campaignId, t.tokenId),
    index('token_sheets_folder_idx').on(t.campaignId, t.folderId),
    index('token_sheets_character_idx').on(t.campaignId, t.characterId),
    // Narrowed by hand to SET NULL ("character_id"), as the folder key below.
    foreignKey({
      name: 'token_sheets_character_fk',
      columns: [t.campaignId, t.characterId],
      foreignColumns: [characters.campaignId, characters.id],
    }).onDelete('set null'),
    check('token_sheets_one_holder', sql`${t.tokenId} IS NULL OR ${t.characterId} IS NULL`),
    // The migration narrows it to SET NULL ("folder_id"): a plain set null would also null the
    // campaign_id (see the 0033 trap in docs/context/library.md).
    foreignKey({
      name: 'token_sheets_folder_fk',
      columns: [t.campaignId, t.folderId],
      foreignColumns: [sceneFolders.campaignId, sceneFolders.id],
    }).onDelete('set null'),
    // Restrict: deleting a template in use is refused, never cascaded over the players' values.
    foreignKey({
      name: 'token_sheets_template_fk',
      columns: [t.campaignId, t.templateId],
      foreignColumns: [sheetTemplates.campaignId, sheetTemplates.id],
    }).onDelete('restrict'),
    check('token_sheets_version_nonnegative', sql`${t.version} >= 0`),
    check('token_sheets_name_length', sql`char_length(${t.name}) between 1 and 60`),
  ],
);

/** One receipt per (table, requester, actionId), like `library_document_actions`. */
export const sheetActions = pgTable(
  'sheet_actions',
  {
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    actionId: uuid('action_id').notNull(),
    operation: text('operation').notNull(),
    fingerprint: text('fingerprint').notNull(),
    receipt: jsonb('receipt').notNull(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.userId, t.actionId] })],
);

export type SheetPo = typeof tokenSheets.$inferSelect;
export type NewSheetPo = typeof tokenSheets.$inferInsert;
export type SheetVisibilityPo = SheetPo['visibility'];
export type SheetActionPo = typeof sheetActions.$inferSelect;
