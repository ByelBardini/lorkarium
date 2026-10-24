import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.po';

/** The TOTP of an account: pending while `enabled_at` is null (set up, not confirmed yet). */
export const userTwoFactor = pgTable('user_two_factor', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  // The base32 secret sealed for `totp-secret` with the user id as context; never in clear.
  secretCipher: text('secret_cipher').notNull(),
  enabledAt: timestamp('enabled_at', { withTimezone: true }),
  // The last accepted time step (RFC 6238 §5.2): a code of this step or an older one is a replay.
  lastStep: integer('last_step'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One-time recovery codes, kept by blind index (HMAC): the lookup is an equality, not 10 hashes. */
export const recoveryCodes = pgTable(
  'recovery_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeIndex: text('code_index').notNull().unique(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('recovery_codes_user_id_idx').on(table.userId)],
);

export type UserTwoFactorPo = typeof userTwoFactor.$inferSelect;
export type RecoveryCodePo = typeof recoveryCodes.$inferSelect;
