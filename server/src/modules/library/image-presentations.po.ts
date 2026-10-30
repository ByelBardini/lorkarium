import { sql } from 'drizzle-orm';
import { check, foreignKey, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { campaigns } from '../campaigns/campaigns.po';
import { libraryImages } from './library-images.po';
export const libraryImagePresentations = pgTable(
  'library_image_presentations',
  {
    campaignId: uuid('campaign_id')
      .primaryKey()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().default(0),
    presentationId: uuid('presentation_id'),
    imageId: uuid('image_id'),
    nameAtPresentation: text('name_at_presentation'),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'library_image_presentations_image_fk',
      columns: [t.campaignId, t.imageId],
      foreignColumns: [libraryImages.campaignId, libraryImages.id],
    }),
    check('library_image_presentations_version', sql`${t.version} >= 0`),
    check(
      'library_image_presentations_complete',
      sql`(${t.presentationId} IS NULL AND ${t.imageId} IS NULL AND ${t.nameAtPresentation} IS NULL) OR (${t.presentationId} IS NOT NULL AND ${t.imageId} IS NOT NULL AND ${t.nameAtPresentation} IS NOT NULL)`,
    ),
  ],
);
export type ImagePresentationPo = typeof libraryImagePresentations.$inferSelect;
