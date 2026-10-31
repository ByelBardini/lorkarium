import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { libraryDocuments } from './documents.po';

export const documentTabVisibility = pgEnum('document_tab_visibility', ['document', 'masters']);
// The (document_id, position) unique is DEFERRABLE INITIALLY DEFERRED in 0070 (edited by hand:
// drizzle-kit cannot declare it), so one UPDATE can swap positions during a reorder.
export const libraryDocumentTabs = pgTable(
  'library_document_tabs',
  {
    campaignId: uuid('campaign_id').notNull(),
    documentId: uuid('document_id').notNull(),
    id: uuid('id').notNull().defaultRandom(),
    name: text('name').notNull(),
    position: integer('position').notNull(),
    visibility: documentTabVisibility('visibility').notNull().default('document'),
    content: jsonb('content').notNull(),
    schemaVersion: integer('schema_version').notNull().default(1),
    version: integer('version').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.campaignId, t.id] }),
    unique('library_document_tabs_document_tab_unique').on(t.campaignId, t.documentId, t.id),
    unique('library_document_tabs_position_unique').on(t.documentId, t.position),
    foreignKey({
      name: 'library_document_tabs_document_fk',
      columns: [t.campaignId, t.documentId],
      foreignColumns: [libraryDocuments.campaignId, libraryDocuments.id],
    }).onDelete('cascade'),
    check('library_document_tabs_name_length', sql`char_length(${t.name}) between 1 and 40`),
    check('library_document_tabs_position_nonnegative', sql`${t.position} >= 0`),
    check('library_document_tabs_version_nonnegative', sql`${t.version} >= 0`),
  ],
);
export type DocumentTabPo = typeof libraryDocumentTabs.$inferSelect;
export type NewDocumentTabPo = typeof libraryDocumentTabs.$inferInsert;
export type DocumentTabSummaryPo = Omit<DocumentTabPo, 'content' | 'schemaVersion' | 'createdAt'>;
