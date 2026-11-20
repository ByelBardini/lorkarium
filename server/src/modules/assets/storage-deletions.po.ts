import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** An object of the bucket whose row is already gone and that still has to leave the S3. It is
 *  written in the same transaction that deletes the row, so a rollback keeps both and a failed
 *  `remove` is tried again instead of leaving an orphan. */
export const storageDeletions = pgTable(
  'storage_deletions',
  {
    key: text('key').primaryKey(),
    // Failed removals so far; the next try waits longer after each one.
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    enqueuedAt: timestamp('enqueued_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('storage_deletions_next_attempt_at_idx').on(table.nextAttemptAt)],
);

export type StorageDeletionPo = typeof storageDeletions.$inferSelect;
