import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.po';

// Not `sessions`: spec §6 reserves Session for the multiplayer game session.
export const authSessions = pgTable(
  'auth_sessions',
  {
    // SHA-256 hex of the cookie token; the token itself is never stored.
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    persistent: boolean('persistent').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('auth_sessions_user_id_idx').on(table.userId)],
);

export type AuthSessionPo = typeof authSessions.$inferSelect;
export type NewAuthSessionPo = typeof authSessions.$inferInsert;
