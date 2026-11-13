import { sql } from 'drizzle-orm';
import { check, index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../auth/users.po';

// Written in one direction (who blocked whom), read in both: requests and messages are cut either
// way, and the blocked account is kept out of the tables the blocker owns.
export const userBlocks = pgTable(
  'user_blocks',
  {
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.blockerId, table.blockedId] }),
    index('user_blocks_blocked_id_idx').on(table.blockedId),
    check('user_blocks_not_self', sql`${table.blockerId} <> ${table.blockedId}`),
  ],
);

export type UserBlockPo = typeof userBlocks.$inferSelect;
