import { sql } from 'drizzle-orm';
import { check, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../auth/users.po';

// The colors one account keeps to reuse anywhere. Each thing painted holds its own copy of the
// hex, so taking a color off this list repaints nothing.
export const accountSavedColors = pgTable(
  'account_saved_colors',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    color: text('color').$type<`#${string}`>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.color] }),
    check('account_saved_colors_color_hex', sql`${table.color} ~ '^#[0-9a-f]{6}$'`),
  ],
);

export type SavedColorPo = typeof accountSavedColors.$inferSelect;
