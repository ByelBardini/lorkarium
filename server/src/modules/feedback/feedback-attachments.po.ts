import { SCREENSHOT_MIME_TYPES } from '@lorkarium/contracts';
import { sql } from 'drizzle-orm';
import { check, index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../auth/users.po';
import { feedbackEntries } from './feedback-entries.po';

export const feedbackAttachmentMimeType = pgEnum(
  'feedback_attachment_mime_type',
  SCREENSHOT_MIME_TYPES,
);

// A screenshot sent with a feedback entry: uploaded first, alone ("loose", `feedback_id` null,
// tied to whoever sent it), then claimed by the entry; a loose one is deleted after a day. Only
// the backoffice reads it and it never goes to GitHub. The object lives under `feedback/<id>`.
export const feedbackAttachments = pgTable(
  'feedback_attachments',
  {
    id: uuid('id').primaryKey(),
    feedbackId: uuid('feedback_id').references(() => feedbackEntries.id, { onDelete: 'cascade' }),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull().unique(),
    mimeType: feedbackAttachmentMimeType('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('feedback_attachments_feedback_idx').on(table.feedbackId),
    index('feedback_attachments_uploaded_by_idx').on(table.uploadedBy),
    index('feedback_attachments_loose_created_idx')
      .on(table.createdAt)
      .where(sql`${table.feedbackId} is null`),
    check('feedback_attachments_size_positive', sql`${table.sizeBytes} > 0`),
  ],
);

export type FeedbackAttachmentPo = typeof feedbackAttachments.$inferSelect;
export type NewFeedbackAttachmentPo = typeof feedbackAttachments.$inferInsert;
