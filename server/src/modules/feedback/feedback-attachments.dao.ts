import { and, asc, eq, inArray, isNull, lt } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import {
  feedbackAttachments,
  type FeedbackAttachmentPo,
  type NewFeedbackAttachmentPo,
} from './feedback-attachments.po';

/** The screenshots of the feedback entries: uploaded loose by the sender, claimed by one entry,
 *  read by the backoffice and deleted with the entry, the account, or after a day loose.
 *
 *  Example: `await new FeedbackAttachmentsDao(tx).claim(entryId, [shotId])` */
export class FeedbackAttachmentsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async insert(attachment: NewFeedbackAttachmentPo): Promise<FeedbackAttachmentPo> {
    const [row] = await this.db.insert(feedbackAttachments).values(attachment).returning();
    if (row) return row;
    throw new Error(`feedback attachment ${attachment.id} was not inserted: expected one row back`);
  }

  /** Of `ids`, the ones `uploaderId` sent and no entry claimed, locked until the claim.
   *
   *  Example: `await attachments.lockLooseOf(biaId, [shotA, shotB]) // [shotA]` */
  async lockLooseOf(uploaderId: string, ids: readonly string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ id: feedbackAttachments.id })
      .from(feedbackAttachments)
      .where(
        and(
          inArray(feedbackAttachments.id, [...ids]),
          eq(feedbackAttachments.uploadedBy, uploaderId),
          isNull(feedbackAttachments.feedbackId),
        ),
      )
      .for('update');
    return rows.map((row) => row.id);
  }

  async claim(feedbackId: string, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(feedbackAttachments)
      .set({ feedbackId })
      .where(inArray(feedbackAttachments.id, [...ids]));
  }

  /** The screenshots of these entries, oldest first. */
  async listOf(feedbackIds: readonly string[]): Promise<FeedbackAttachmentPo[]> {
    if (feedbackIds.length === 0) return [];
    return this.db
      .select()
      .from(feedbackAttachments)
      .where(inArray(feedbackAttachments.feedbackId, [...feedbackIds]))
      .orderBy(asc(feedbackAttachments.createdAt), asc(feedbackAttachments.id));
  }

  /** `undefined` when the screenshot is not one of that entry (loose, or of another entry). */
  async findInEntry(feedbackId: string, id: string): Promise<FeedbackAttachmentPo | undefined> {
    const [row] = await this.db
      .select()
      .from(feedbackAttachments)
      .where(and(eq(feedbackAttachments.id, id), eq(feedbackAttachments.feedbackId, feedbackId)));
    return row;
  }

  /** The bucket keys of one entry's screenshots, read before the entry is deleted. */
  async storageKeysOf(feedbackId: string): Promise<string[]> {
    const rows = await this.db
      .select({ key: feedbackAttachments.storageKey })
      .from(feedbackAttachments)
      .where(eq(feedbackAttachments.feedbackId, feedbackId));
    return rows.map((row) => row.key);
  }

  /** Every bucket key one account uploaded (loose or claimed), read before the account goes.
   *
   *  Example: `await attachments.storageKeysOfUploader(biaId) // ['feedback/<id>']` */
  async storageKeysOfUploader(uploaderId: string): Promise<string[]> {
    const rows = await this.db
      .select({ key: feedbackAttachments.storageKey })
      .from(feedbackAttachments)
      .where(eq(feedbackAttachments.uploadedBy, uploaderId));
    return rows.map((row) => row.key);
  }

  /** Deletes up to `limit` loose screenshots older than `cut` and gives back their bucket keys.
   *
   *  Example: `await attachments.deleteLooseBefore(cut, 500) // ['feedback/<id>']` */
  async deleteLooseBefore(cut: Date, limit: number): Promise<string[]> {
    const expired = this.db
      .select({ id: feedbackAttachments.id })
      .from(feedbackAttachments)
      .where(and(isNull(feedbackAttachments.feedbackId), lt(feedbackAttachments.createdAt, cut)))
      .limit(limit)
      .for('update', { skipLocked: true });
    const rows = await this.db
      .delete(feedbackAttachments)
      .where(inArray(feedbackAttachments.id, expired))
      .returning({ key: feedbackAttachments.storageKey });
    return rows.map((row) => row.key);
  }
}
