import { sql } from 'drizzle-orm';
import { check, index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../auth/users.po';

// One row per pair, in canonical order (`user_low < user_high`): the pair can never be written
// twice in opposite directions, and "friends of X" reads both columns, one index each.
export const friendships = pgTable(
  'friendships',
  {
    userLow: uuid('user_low')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userHigh: uuid('user_high')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userLow, table.userHigh] }),
    index('friendships_user_high_idx').on(table.userHigh),
    check('friendships_canonical_pair', sql`${table.userLow} < ${table.userHigh}`),
  ],
);

export type FriendshipPo = typeof friendships.$inferSelect;
