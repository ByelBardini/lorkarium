import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// The blind index (HMAC) of the e-mail of an account deleted for a violation: an invitation to it
// is refused for 5 years (use policy §8). The e-mail in clear is never kept.
export const bannedEmailIndexes = pgTable(
  'banned_email_indexes',
  {
    emailIndex: text('email_index').primaryKey(),
    bannedAt: timestamp('banned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('banned_email_indexes_banned_at_idx').on(table.bannedAt)],
);

export type BannedEmailIndexPo = typeof bannedEmailIndexes.$inferSelect;
