import type { StorageDeletionsDao } from '../assets/storage-deletions.dao';
import type { ClockPort } from '../auth/clock.port';
import type { ReportAttachmentsDao } from './report-attachments.dao';
import { ReportRetentionBo } from './report-retention.bo';
import type { ReportsDao } from './reports.dao';

/** One batch of the retention: the reports, their screenshots and the bucket queue, on one `tx`. */
export type ReportRetentionScope = Readonly<{
  reports: Pick<ReportsDao, 'lockClosedBefore' | 'deleteByIds'>;
  attachments: Pick<ReportAttachmentsDao, 'storageKeysOf' | 'deleteLooseBefore'>;
  deletions: Pick<StorageDeletionsDao, 'enqueue'>;
}>;

export type ReportRetentionTransactionRunner = <T>(
  work: (scope: ReportRetentionScope) => Promise<T>,
) => Promise<T>;

export type ReportRetentionServiceDeps = Readonly<{
  transaction: ReportRetentionTransactionRunner;
  clock: ClockPort;
  /** Rows per transaction; a full batch asks for another one. */
  batchSize: number;
}>;

/** What one purge deleted: closed reports past 6 months and loose screenshots past a day. */
export type ReportRetentionOutcome = Readonly<{ reports: number; looseAttachments: number }>;

/** The reports' own retention: a closed report leaves 6 months after it was closed, with its
 *  screenshots; a screenshot no report claimed leaves after a day. The rows go and their objects
 *  enter the bucket queue in the same transaction. An open report never leaves.
 *
 *  Example: `await retention.purge() // { reports: 2, looseAttachments: 1 }` */
export class ReportRetentionService {
  constructor(private readonly deps: ReportRetentionServiceDeps) {}

  async purge(): Promise<ReportRetentionOutcome> {
    const now = this.deps.clock.now();
    const closedCut = ReportRetentionBo.closedReportsCutOf(now);
    const reports = await this.inBatches(() => this.purgeClosed(closedCut));
    const looseCut = ReportRetentionBo.looseAttachmentsCutOf(now);
    const looseAttachments = await this.inBatches(() => this.purgeLoose(looseCut));
    return { reports, looseAttachments };
  }

  private async inBatches(batch: () => Promise<number>): Promise<number> {
    let total = 0;
    let deleted = this.deps.batchSize;
    while (deleted === this.deps.batchSize) {
      deleted = await batch();
      total += deleted;
    }
    return total;
  }

  private purgeClosed(cut: Date): Promise<number> {
    return this.deps.transaction(async ({ reports, attachments, deletions }) => {
      const ids = await reports.lockClosedBefore(cut, this.deps.batchSize);
      await deletions.enqueue(await attachments.storageKeysOf(ids));
      await reports.deleteByIds(ids);
      return ids.length;
    });
  }

  private purgeLoose(cut: Date): Promise<number> {
    return this.deps.transaction(async ({ attachments, deletions }) => {
      const keys = await attachments.deleteLooseBefore(cut, this.deps.batchSize);
      await deletions.enqueue(keys);
      return keys.length;
    });
  }
}
