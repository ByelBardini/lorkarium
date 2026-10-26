import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { campaignMembers } from '../campaigns/campaign-members.po';

/** One piece of a saved roll as the `parts` column keeps it. */
export type SavedRollPartPo = Readonly<{ label: string | null; expression: string }>;

// The rolls a member keeps at one table, seen and edited only by that member. The composite key
// to campaign_members takes them along when the member leaves (or the table is deleted).
// `name_key` is the name without case or accent, computed by the app: Postgres has no unaccent
// without an extension.
export const savedRolls = pgTable(
  'saved_rolls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id').notNull(),
    userId: uuid('user_id').notNull(),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    parts: jsonb('parts').$type<SavedRollPartPo[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'saved_rolls_member_fk',
      columns: [table.campaignId, table.userId],
      foreignColumns: [campaignMembers.campaignId, campaignMembers.userId],
    }).onDelete('cascade'),
    uniqueIndex('saved_rolls_member_name_unique').on(table.campaignId, table.userId, table.nameKey),
    check('saved_rolls_name_length', sql`char_length(${table.name}) BETWEEN 1 AND 40`),
  ],
);

export type SavedRollPo = typeof savedRolls.$inferSelect;
export type NewSavedRollPo = typeof savedRolls.$inferInsert;
/** What an edit saves: an absent key stays; the name always travels with its key. */
export type SavedRollChangesPo = Partial<Pick<SavedRollPo, 'name' | 'nameKey' | 'parts'>>;
