import { boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.po';

/** The second step of a login: the password was right, the 2FA code is still due. */
export const twoFactorChallenges = pgTable('two_factor_challenges', {
  // SHA-256 hex of the `lk_2fa` cookie token; the token itself is never stored.
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // The "keep me signed in" of the first step, honored when the session is finally issued.
  persistent: boolean('persistent').notNull(),
  failures: integer('failures').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type TwoFactorChallengePo = typeof twoFactorChallenges.$inferSelect;
export type NewTwoFactorChallengePo = typeof twoFactorChallenges.$inferInsert;
