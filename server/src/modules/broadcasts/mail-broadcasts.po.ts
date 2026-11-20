import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../auth/users.po';

/** The segment as kept: every active account, the paid plans in force, or one plan on sale. The
 *  mapper reads it back through `mailBroadcastSegmentDto`. */
export type StoredSegment = 'all' | 'paid' | Readonly<{ plan: string }>;

export type StoredButton = Readonly<{ label: string; href: string }>;

/** A service notice of the backoffice. Kept 5 years with its deliveries: the proof of who was
 *  told (a price change 30 days ahead) and when. */
export const mailBroadcasts = pgTable(
  'mail_broadcasts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    segment: jsonb('segment').$type<StoredSegment>().notNull(),
    subject: text('subject').notNull(),
    title: text('title').notNull(),
    paragraphs: jsonb('paragraphs').$type<string[]>().notNull(),
    button: jsonb('button').$type<StoredButton>(),
    // The admin who wrote it; null once that account is deleted.
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // The last test sent to the admin's own inbox; a rewrite of the draft clears it.
    testedAt: timestamp('tested_at', { withTimezone: true }),
    // The audience is frozen here: one delivery per account, `total` of them.
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    total: integer('total'),
  },
  (table) => [
    index('mail_broadcasts_created_at_idx').on(table.createdAt),
    check(
      'mail_broadcasts_total_when_confirmed',
      sql`(${table.confirmedAt} IS NULL) = (${table.total} IS NULL)`,
    ),
    check(
      'mail_broadcasts_finished_after_confirmed',
      sql`${table.finishedAt} IS NULL OR ${table.confirmedAt} IS NOT NULL`,
    ),
  ],
);

export type MailBroadcastPo = typeof mailBroadcasts.$inferSelect;
export type NewMailBroadcastPo = typeof mailBroadcasts.$inferInsert;
