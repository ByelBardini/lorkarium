import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../auth/users.po';
import { mailBroadcasts } from './mail-broadcasts.po';

/** One recipient of a confirmed notice. The address is never stored: it is opened from
 *  `users.email_cipher` at send time. Exactly one of sent, failed or skipped ends the row. */
export const mailBroadcastDeliveries = pgTable(
  'mail_broadcast_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    broadcastId: uuid('broadcast_id')
      .notNull()
      .references(() => mailBroadcasts.id, { onDelete: 'cascade' }),
    // Null once the account is deleted: the row stays as the proof and is skipped.
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    attempts: integer('attempts').notNull().default(0),
    // A sending cycle holds the row until then; a crashed cycle frees it when the time passes.
    claimedUntil: timestamp('claimed_until', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    skippedAt: timestamp('skipped_at', { withTimezone: true }),
    // The last failure, without the address.
    error: text('error'),
  },
  (table) => [
    uniqueIndex('mail_broadcast_deliveries_recipient_idx').on(table.broadcastId, table.userId),
    index('mail_broadcast_deliveries_pending_idx')
      .on(table.broadcastId)
      .where(
        sql`${table.sentAt} IS NULL AND ${table.failedAt} IS NULL AND ${table.skippedAt} IS NULL`,
      ),
    check(
      'mail_broadcast_deliveries_one_end',
      sql`num_nonnulls(${table.sentAt}, ${table.failedAt}, ${table.skippedAt}) <= 1`,
    ),
    check('mail_broadcast_deliveries_error_length', sql`char_length(${table.error}) <= 500`),
  ],
);

export type MailBroadcastDeliveryPo = typeof mailBroadcastDeliveries.$inferSelect;
