import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { userRole, users } from '../auth/users.po';

/** A pending invitation: the `users` row is only born when it is accepted (the @ comes then). */
export const invitations = pgTable('invitations', {
  // Public id for the admin's URLs; the link carries a token whose hash is `token_hash`.
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull().unique(),
  // The address sealed for `invitation-email` with the invitation id as context, and its blind
  // index (the `email-index` purpose of `users`): one pending invitation per address.
  emailCipher: text('email_cipher').notNull(),
  emailIndex: text('email_index').notNull().unique(),
  role: userRole('role').notNull(),
  invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export type InvitationPo = typeof invitations.$inferSelect;
export type NewInvitationPo = typeof invitations.$inferInsert;
