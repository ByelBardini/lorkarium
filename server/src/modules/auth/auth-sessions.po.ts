import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.po';

/** The user agent kept per session is cut to this many characters (it is only read into a device). */
export const USER_AGENT_MAX_LENGTH = 512;

// Not `sessions`: spec §6 reserves Session for the multiplayer game session.
export const authSessions = pgTable(
  'auth_sessions',
  {
    // SHA-256 hex of the cookie token; the token itself is never stored.
    id: text('id').primaryKey(),
    // What the "where you are signed in" list and its URL use: the hash above never leaves the server.
    publicId: uuid('public_id').notNull().unique().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    persistent: boolean('persistent').notNull(),
    // Read into browser, system and form factor; no IP and no city are kept.
    userAgent: text('user_agent'),
    // Rewritten in steps of LAST_SEEN_STEP_MS, not on every request.
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('auth_sessions_user_id_idx').on(table.userId)],
);

export type AuthSessionPo = typeof authSessions.$inferSelect;
export type NewAuthSessionPo = typeof authSessions.$inferInsert;
