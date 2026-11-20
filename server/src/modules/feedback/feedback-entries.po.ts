import { FEEDBACK_KINDS, FEEDBACK_PLATFORMS } from '@lorkarium/contracts';
import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../auth/users.po';

export const feedbackKind = pgEnum('feedback_kind', FEEDBACK_KINDS);
export const feedbackPlatform = pgEnum('feedback_platform', FEEDBACK_PLATFORMS);

// A bug report or a suggestion waiting in the backoffice queue. It lives only while it waits:
// publishing it as a GitHub issue or archiving it deletes the row (and its screenshots), and so
// does deleting the sender's account. The sections are the issue forms' (`bug.yml`, `sugestao.yml`).
export const feedbackEntries = pgTable(
  'feedback_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // The @ of when it was sent, shown in the queue.
    senderUsername: text('sender_username').notNull(),
    kind: feedbackKind('kind').notNull(),
    steps: text('steps'),
    expected: text('expected'),
    actual: text('actual'),
    problem: text('problem'),
    idea: text('idea'),
    alternatives: text('alternatives'),
    platform: feedbackPlatform('platform').notNull(),
    appVersion: text('app_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('feedback_entries_created_idx').on(table.createdAt),
    index('feedback_entries_sender_idx').on(table.senderId),
    check(
      'feedback_entries_sections_of_kind',
      sql`(${table.kind} = 'bug' and ${table.steps} is not null and ${table.expected} is not null and ${table.actual} is not null and ${table.problem} is null and ${table.idea} is null and ${table.alternatives} is null) or (${table.kind} = 'suggestion' and ${table.problem} is not null and ${table.idea} is not null and ${table.steps} is null and ${table.expected} is null and ${table.actual} is null)`,
    ),
    check(
      'feedback_entries_sections_length',
      sql`greatest(char_length(${table.steps}), char_length(${table.expected}), char_length(${table.actual}), char_length(${table.problem}), char_length(${table.idea}), char_length(${table.alternatives})) <= 2000`,
    ),
    check('feedback_entries_app_version_length', sql`char_length(${table.appVersion}) <= 100`),
  ],
);

export type FeedbackEntryPo = typeof feedbackEntries.$inferSelect;
export type NewFeedbackEntryPo = typeof feedbackEntries.$inferInsert;
