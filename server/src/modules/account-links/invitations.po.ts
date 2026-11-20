import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { userRole, users } from '../auth/users.po';

/** Who asked for the link: an admin in the backoffice, or the person at the public sign-up. */
export const invitationOrigin = pgEnum('invitation_origin', ['admin', 'self']);

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
  // The deadline, the page of the link and the backoffice list depend on it.
  origin: invitationOrigin('origin').notNull().default('admin'),
  invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export type InvitationPo = typeof invitations.$inferSelect;
export type NewInvitationPo = typeof invitations.$inferInsert;
