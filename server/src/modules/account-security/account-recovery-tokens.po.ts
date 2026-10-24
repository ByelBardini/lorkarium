import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../auth/users.po';

export const accountRecoveryKind = pgEnum('account_recovery_kind', [
  'cancel-email-change',
  'revert-email-change',
  'revert-password-change',
]);

/** "Não fui eu" links of the security notices; several per account, all die when one is used. */
export const accountRecoveryTokens = pgTable(
  'account_recovery_tokens',
  {
    // SHA-256 hex of the link token; the token itself only travels in the e-mail.
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: accountRecoveryKind('kind').notNull(),
    // Only a revert keeps the address that comes back: sealed as `user-email` with the user id as
    // context and its blind index, so the swap copies both to `users` as they are.
    emailCipher: text('email_cipher'),
    emailIndex: text('email_index'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('account_recovery_tokens_user_id_idx').on(table.userId),
    check(
      'account_recovery_tokens_email_only_on_revert',
      sql`(${table.kind} = 'revert-email-change') = (${table.emailCipher} IS NOT NULL AND ${table.emailIndex} IS NOT NULL)`,
    ),
  ],
);

export type AccountRecoveryTokenPo = typeof accountRecoveryTokens.$inferSelect;
export type NewAccountRecoveryTokenPo = typeof accountRecoveryTokens.$inferInsert;
