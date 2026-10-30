import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { campaigns } from '../campaigns/campaigns.po';
import { campaignMembers } from '../campaigns/campaign-members.po';
import { users } from '../auth/users.po';
import { assets } from '../assets/assets.po';
import { sceneFolders } from '../library/scene-folders.po';
import { sceneVisibility } from '../scenes/scenes.po';

export const libraryDocuments = pgTable(
  'library_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    folderId: uuid('folder_id'),
    name: text('name').notNull(),
    visibility: sceneVisibility('visibility').notNull().default('private'),
    content: jsonb('content').notNull(),
    schemaVersion: integer('schema_version').notNull().default(1),
    version: integer('version').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('library_documents_campaign_id_id_unique').on(t.campaignId, t.id),
    index('library_documents_folder_idx').on(t.campaignId, t.folderId),
    foreignKey({
      name: 'library_documents_folder_fk',
      columns: [t.campaignId, t.folderId],
      foreignColumns: [sceneFolders.campaignId, sceneFolders.id],
    }).onDelete('set null'),
    check('library_documents_name_length', sql`char_length(${t.name}) between 1 and 60`),
    check('library_documents_version_nonnegative', sql`${t.version} >= 0`),
  ],
);
export const libraryDocumentOwners = pgTable(
  'library_document_owners',
  {
    campaignId: uuid('campaign_id').notNull(),
    documentId: uuid('document_id').notNull(),
    userId: uuid('user_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.campaignId, t.documentId, t.userId] }),
    index('library_document_owners_user_idx').on(t.campaignId, t.userId),
    foreignKey({
      columns: [t.campaignId, t.documentId],
      foreignColumns: [libraryDocuments.campaignId, libraryDocuments.id],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.campaignId, t.userId],
      foreignColumns: [campaignMembers.campaignId, campaignMembers.userId],
    }).onDelete('cascade'),
  ],
);
export const libraryDocumentAssets = pgTable(
  'library_document_assets',
  {
    campaignId: uuid('campaign_id').notNull(),
    documentId: uuid('document_id').notNull(),
    assetId: uuid('asset_id').notNull(),
    inContent: boolean('in_content').notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.campaignId, t.documentId, t.assetId] }),
    index('library_document_assets_asset_idx').on(t.campaignId, t.assetId),
    foreignKey({
      columns: [t.campaignId, t.documentId],
      foreignColumns: [libraryDocuments.campaignId, libraryDocuments.id],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.campaignId, t.assetId],
      foreignColumns: [assets.campaignId, assets.id],
    }).onDelete('cascade'),
  ],
);
export const libraryDocumentActions = pgTable(
  'library_document_actions',
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
export type DocumentPo = typeof libraryDocuments.$inferSelect;
export type NewDocumentPo = typeof libraryDocuments.$inferInsert;
export type DocumentChangesPo = Partial<
  Pick<DocumentPo, 'name' | 'content' | 'folderId' | 'visibility' | 'version' | 'updatedAt'>
>;
export type DocumentActionPo = typeof libraryDocumentActions.$inferSelect;
