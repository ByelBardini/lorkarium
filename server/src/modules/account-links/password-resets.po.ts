import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../auth/users.po';

/** The new-password link an admin sent: one per account (a new one replaces it). */
export const passwordResets = pgTable('password_resets', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull().unique(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export type PasswordResetPo = typeof passwordResets.$inferSelect;
export type NewPasswordResetPo = typeof passwordResets.$inferInsert;
