import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../auth/users.po';

/** One pending e-mail change per account: a new request replaces the previous one. */
export const emailChangeRequests = pgTable('email_change_requests', {
  // SHA-256 hex of the link token; the token itself only travels in the e-mail.
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  // The new address sealed for `pending-email` with the user id as context, and its blind index
  // (the same `email-index` purpose as `users`, so the swap copies it as is).
  emailCipher: text('email_cipher').notNull(),
  emailIndex: text('email_index').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type EmailChangeRequestPo = typeof emailChangeRequests.$inferSelect;
export type NewEmailChangeRequestPo = typeof emailChangeRequests.$inferInsert;
