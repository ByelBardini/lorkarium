import { and, asc, eq, inArray, isNull, lt } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import {
  reportAttachments,
  type NewReportAttachmentPo,
  type ReportAttachmentPo,
} from './report-attachments.po';

/** The screenshots of the reports: uploaded loose by the reporter, claimed by one report, read by
 *  the backoffice and deleted with the report or after a day loose.
 *
 *  Example: `await new ReportAttachmentsDao(tx).claim(reportId, [shotId])` */
export class ReportAttachmentsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async insert(attachment: NewReportAttachmentPo): Promise<ReportAttachmentPo> {
    const [row] = await this.db.insert(reportAttachments).values(attachment).returning();
    if (row) return row;
    throw new Error(`report attachment ${attachment.id} was not inserted: expected one row back`);
  }

  /** Of `ids`, the ones `uploaderId` sent and no report claimed, locked until the claim.
   *
   *  Example: `await attachments.lockLooseOf(biaId, [shotA, shotB]) // [shotA]` */
  async lockLooseOf(uploaderId: string, ids: readonly string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ id: reportAttachments.id })
      .from(reportAttachments)
      .where(
        and(
          inArray(reportAttachments.id, [...ids]),
          eq(reportAttachments.uploadedBy, uploaderId),
          isNull(reportAttachments.reportId),
        ),
      )
      .for('update');
    return rows.map((row) => row.id);
  }

  async claim(reportId: string, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(reportAttachments)
      .set({ reportId })
      .where(inArray(reportAttachments.id, [...ids]));
  }

  /** The screenshots of these reports, oldest first.
   *
   *  Example: `await attachments.listOf([reportId]) // [{ id, reportId, … }]` */
  async listOf(reportIds: readonly string[]): Promise<ReportAttachmentPo[]> {
    if (reportIds.length === 0) return [];
    return this.db
      .select()
      .from(reportAttachments)
      .where(inArray(reportAttachments.reportId, [...reportIds]))
      .orderBy(asc(reportAttachments.createdAt), asc(reportAttachments.id));
  }

  /** `undefined` when the screenshot is not one of that report (loose, or of another report). */
  async findInReport(reportId: string, id: string): Promise<ReportAttachmentPo | undefined> {
    const [row] = await this.db
      .select()
      .from(reportAttachments)
      .where(and(eq(reportAttachments.id, id), eq(reportAttachments.reportId, reportId)));
    return row;
  }

  /** The bucket keys of these reports' screenshots, read before the reports are deleted. */
  async storageKeysOf(reportIds: readonly string[]): Promise<string[]> {
    if (reportIds.length === 0) return [];
    const rows = await this.db
      .select({ key: reportAttachments.storageKey })
      .from(reportAttachments)
      .where(inArray(reportAttachments.reportId, [...reportIds]));
    return rows.map((row) => row.key);
  }

  /** Deletes up to `limit` loose screenshots older than `cut` and gives back their bucket keys.
   *
   *  Example: `await attachments.deleteLooseBefore(cut, 500) // ['reports/<id>']` */
  async deleteLooseBefore(cut: Date, limit: number): Promise<string[]> {
    const expired = this.db
      .select({ id: reportAttachments.id })
      .from(reportAttachments)
      .where(and(isNull(reportAttachments.reportId), lt(reportAttachments.createdAt, cut)))
      .limit(limit)
      .for('update', { skipLocked: true });
    const rows = await this.db
      .delete(reportAttachments)
      .where(inArray(reportAttachments.id, expired))
      .returning({ key: reportAttachments.storageKey });
    return rows.map((row) => row.key);
  }
}
