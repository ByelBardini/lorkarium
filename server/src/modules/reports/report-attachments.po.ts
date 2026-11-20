import { sql } from 'drizzle-orm';
import { check, index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../auth/users.po';
import { userReports } from './user-reports.po';

export const reportAttachmentMimeType = pgEnum('report_attachment_mime_type', [
  'image/png',
  'image/jpeg',
  'image/webp',
]);

// A screenshot sent with a report. It is uploaded first, alone ("loose", `report_id` null, tied to
// whoever sent it), and the report then claims it; a loose one is deleted after a day. Only the
// backoffice reads it. The object lives in the bucket under `reports/<id>`.
export const reportAttachments = pgTable(
  'report_attachments',
  {
    id: uuid('id').primaryKey(),
    reportId: uuid('report_id').references(() => userReports.id, { onDelete: 'cascade' }),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    storageKey: text('storage_key').notNull().unique(),
    mimeType: reportAttachmentMimeType('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('report_attachments_report_idx').on(table.reportId),
    index('report_attachments_uploaded_by_idx').on(table.uploadedBy),
    index('report_attachments_loose_created_idx')
      .on(table.createdAt)
      .where(sql`${table.reportId} is null`),
    check('report_attachments_size_positive', sql`${table.sizeBytes} > 0`),
  ],
);

export type ReportAttachmentPo = typeof reportAttachments.$inferSelect;
export type NewReportAttachmentPo = typeof reportAttachments.$inferInsert;
