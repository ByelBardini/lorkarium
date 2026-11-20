import type { StorageDeletionsDao } from '../assets/storage-deletions.dao';
import type { ClockPort } from '../auth/clock.port';
import type { FeedbackAttachmentsDao } from './feedback-attachments.dao';

// A screenshot is sent right before its entry: one no entry claimed in a day was abandoned.
const LOOSE_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** One batch of the retention: the loose screenshots and the bucket queue, on one `tx`. */
export type FeedbackRetentionScope = Readonly<{
  attachments: Pick<FeedbackAttachmentsDao, 'deleteLooseBefore'>;
  deletions: Pick<StorageDeletionsDao, 'enqueue'>;
}>;

export type FeedbackRetentionServiceDeps = Readonly<{
  transaction: <T>(work: (scope: FeedbackRetentionScope) => Promise<T>) => Promise<T>;
  clock: ClockPort;
  /** Rows per transaction; a full batch asks for another one. */
  batchSize: number;
}>;

export type FeedbackRetentionOutcome = Readonly<{ looseAttachments: number }>;

/** The feedback's own retention: entries never age (closing deletes them), so only a screenshot
 *  no entry claimed leaves, a day after it was sent, with its object queued in the same
 *  transaction.
 *
 *  Example: `await retention.purge() // { looseAttachments: 1 }` */
export class FeedbackRetentionService {
  constructor(private readonly deps: FeedbackRetentionServiceDeps) {}

  async purge(): Promise<FeedbackRetentionOutcome> {
    const cut = new Date(this.deps.clock.now().getTime() - LOOSE_LIFETIME_MS);
    let looseAttachments = 0;
    let deleted = this.deps.batchSize;
    while (deleted === this.deps.batchSize) {
      deleted = await this.purgeLoose(cut);
      looseAttachments += deleted;
    }
    return { looseAttachments };
  }

  private purgeLoose(cut: Date): Promise<number> {
    return this.deps.transaction(async ({ attachments, deletions }) => {
      const keys = await attachments.deleteLooseBefore(cut, this.deps.batchSize);
      await deletions.enqueue(keys);
      return keys.length;
    });
  }
}
