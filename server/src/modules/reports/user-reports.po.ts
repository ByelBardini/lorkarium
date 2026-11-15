import { USER_REPORT_REASONS, USER_REPORT_STATUSES } from '@lorkarium/contracts';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../auth/users.po';

export const userReportReason = pgEnum('user_report_reason', USER_REPORT_REASONS);
export const userReportStatus = pgEnum('user_report_status', USER_REPORT_STATUSES);

// A report from one account on another, for the backoffice queue; the reporter gets no answer.
export const userReports = pgTable(
  'user_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: userReportReason('reason').notNull(),
    details: text('details'),
    status: userReportStatus('status').notNull().default('open'),
    // The admin who closed it; kept as null once that account is deleted.
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One open report per pair: a second one waits until the admin closes the first.
    uniqueIndex('user_reports_open_pair_idx')
      .on(table.reporterId, table.targetId)
      .where(sql`${table.status} = 'open'`),
    index('user_reports_status_created_idx').on(table.status, table.createdAt),
    index('user_reports_target_idx').on(table.targetId),
    check('user_reports_details_length', sql`char_length(${table.details}) <= 1000`),
    check('user_reports_not_self', sql`${table.reporterId} <> ${table.targetId}`),
    check(
      'user_reports_resolved_at_when_closed',
      sql`(${table.status} = 'open') = (${table.resolvedAt} is null)`,
    ),
  ],
);

export type UserReportPo = typeof userReports.$inferSelect;
export type NewUserReportPo = typeof userReports.$inferInsert;
