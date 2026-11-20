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
import { campaigns } from '../campaigns/campaigns.po';

export const userReportReason = pgEnum('user_report_reason', USER_REPORT_REASONS);
export const userReportStatus = pgEnum('user_report_status', USER_REPORT_STATUSES);

// A report from one account on another, for the backoffice queue; the reporter gets no answer.
// It outlives both accounts (and the table): the ids turn null, the @ and the names of the time
// stay, and the report leaves only through its own retention after it is closed.
export const userReports = pgTable(
  'user_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterId: uuid('reporter_id').references(() => users.id, { onDelete: 'set null' }),
    targetId: uuid('target_id').references(() => users.id, { onDelete: 'set null' }),
    reporterUsername: text('reporter_username').notNull(),
    targetUsername: text('target_username').notNull(),
    targetName: text('target_name').notNull(),
    // The table where it happened, one both accounts sat at; its name stays once it is deleted.
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    campaignName: text('campaign_name'),
    reason: userReportReason('reason').notNull(),
    details: text('details'),
    status: userReportStatus('status').notNull().default('open'),
    // The admin who closed it; kept as null once that account is deleted.
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    // When it was closed (resolved or dismissed): the retention counts from here.
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    adminNote: text('admin_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One open report per pair: a second one waits until the admin closes the first. A pair
    // with a deleted side cannot report again, so it is left out.
    uniqueIndex('user_reports_open_pair_idx')
      .on(table.reporterId, table.targetId)
      .where(
        sql`${table.status} = 'open' and ${table.reporterId} is not null and ${table.targetId} is not null`,
      ),
    index('user_reports_status_created_idx').on(table.status, table.createdAt),
    index('user_reports_target_idx').on(table.targetId),
    index('user_reports_reporter_idx').on(table.reporterId),
    index('user_reports_campaign_idx').on(table.campaignId),
    index('user_reports_resolved_at_idx').on(table.resolvedAt),
    check('user_reports_details_length', sql`char_length(${table.details}) <= 1000`),
    check('user_reports_admin_note_length', sql`char_length(${table.adminNote}) <= 2000`),
    check('user_reports_not_self', sql`${table.reporterId} <> ${table.targetId}`),
    check(
      'user_reports_campaign_named',
      sql`${table.campaignId} is null or ${table.campaignName} is not null`,
    ),
    check(
      'user_reports_resolved_at_when_closed',
      sql`(${table.status} = 'open') = (${table.resolvedAt} is null)`,
    ),
  ],
);

export type UserReportPo = typeof userReports.$inferSelect;
export type NewUserReportPo = typeof userReports.$inferInsert;
