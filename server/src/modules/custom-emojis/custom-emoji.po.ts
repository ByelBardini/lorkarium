import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { users } from '../auth/users.po';

// The account's own emojis (`:name:`). The picture lives in the bucket under
// `custom-emojis/<id>` (and `<id>-still` when animated); the row says whether it moves.
export const customEmojis = pgTable(
  'custom_emojis',
  {
    id: uuid('id').primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    animated: boolean('animated').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('custom_emojis_owner_name_unique').on(table.ownerId, table.name),
    check('custom_emojis_name_pattern', sql`${table.name} ~ '^[a-z0-9_]{2,32}$'`),
  ],
);

export type CustomEmojiPo = typeof customEmojis.$inferSelect;
export type NewCustomEmojiPo = typeof customEmojis.$inferInsert;
