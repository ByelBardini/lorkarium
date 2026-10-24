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

// The folders of the scene library, nested. The (campaign_id, id) key lets the parent and the
// scenes point at a folder of the same table only: a folder of another campaign is refused by
// the database itself.
export const sceneFolders = pgTable(
  'scene_folders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('scene_folders_campaign_id_idx').on(table.campaignId),
    unique('scene_folders_campaign_id_id_unique').on(table.campaignId, table.id),
    // The migration narrows it to SET NULL ("parent_id"): drizzle-kit would null campaign_id too.
    foreignKey({
      name: 'scene_folders_parent_fk',
      columns: [table.campaignId, table.parentId],
      foreignColumns: [table.campaignId, table.id],
    }).onDelete('set null'),
    check('scene_folders_name_length', sql`char_length(${table.name}) BETWEEN 1 AND 40`),
  ],
);

export type SceneFolderPo = typeof sceneFolders.$inferSelect;
export type NewSceneFolderPo = typeof sceneFolders.$inferInsert;
/** What renaming or moving a folder saves: an absent key stays, `parentId: null` = the root. */
export type SceneFolderChangesPo = Partial<Pick<SceneFolderPo, 'name' | 'parentId'>>;
