import { sql } from 'drizzle-orm';
import { check, index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../auth/users.po';

// A pending request, one row per direction: accepting it deletes the row and writes the
// friendship. A request to someone who blocked the sender is kept too (it never reaches them).
export const friendRequests = pgTable(
  'friend_requests',
  {
    fromUserId: uuid('from_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    toUserId: uuid('to_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.fromUserId, table.toUserId] }),
    index('friend_requests_to_user_id_idx').on(table.toUserId),
    check('friend_requests_not_to_self', sql`${table.fromUserId} <> ${table.toUserId}`),
  ],
);

export type FriendRequestPo = typeof friendRequests.$inferSelect;
