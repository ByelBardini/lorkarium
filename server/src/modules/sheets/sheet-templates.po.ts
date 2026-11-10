import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../auth/users.po';
import { campaigns } from '../campaigns/campaigns.po';
import { sceneFolders } from '../library/scene-folders.po';

/** The manifest as stored: the JSON the `sheetTemplateManifestDto` let in (the PO imports no DTO). */
export type SheetTemplateManifestPo = Readonly<{
  permissions: readonly string[];
  bars: readonly Readonly<{ label: string; color: string; max: number }>[];
  // Absent in a manifest stored before templates had assets.
  assets?: readonly Readonly<{ path: string; assetId: string }>[];
}>;

/** The files as stored: the ordered list the `sheetTemplateFilesDto` let in. */
export type SheetTemplateFilesPo = readonly Readonly<{ path: string; content: string }>[];

export const sheetTemplates = pgTable(
  'sheet_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    folderId: uuid('folder_id'),
    name: text('name').notNull(),
    files: jsonb('files').$type<SheetTemplateFilesPo>().notNull(),
    manifest: jsonb('manifest')
      .$type<SheetTemplateManifestPo>()
      .notNull()
      .default({ permissions: [], bars: [] }),
    version: integer('version').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('sheet_templates_campaign_id_id_unique').on(t.campaignId, t.id),
    index('sheet_templates_folder_idx').on(t.campaignId, t.folderId),
    // The migration narrows it to SET NULL ("folder_id"): a plain set null would also null the
    // campaign_id (see the 0033 trap in docs/context/library.md).
    foreignKey({
      name: 'sheet_templates_folder_fk',
      columns: [t.campaignId, t.folderId],
      foreignColumns: [sceneFolders.campaignId, sceneFolders.id],
    }).onDelete('set null'),
    check('sheet_templates_name_length', sql`char_length(${t.name}) between 1 and 60`),
    check('sheet_templates_version_nonnegative', sql`${t.version} >= 0`),
  ],
);
export type SheetTemplatePo = typeof sheetTemplates.$inferSelect;
export type NewSheetTemplatePo = typeof sheetTemplates.$inferInsert;
export type SheetTemplateSummaryPo = Omit<
  SheetTemplatePo,
  'files' | 'manifest' | 'createdBy' | 'createdAt'
>;
export type SheetTemplateChangesPo = Partial<
  Pick<SheetTemplatePo, 'name' | 'folderId' | 'files' | 'manifest' | 'version' | 'updatedAt'>
>;
