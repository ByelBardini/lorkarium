import type { ClockPort } from '../auth/clock.port';
import type { AssetStoragePort } from './asset-storage.port';
import type { StorageDeletionPo } from './storage-deletions.po';
import type { StorageDeletionsDao } from './storage-deletions.dao';

const MINUTE_MS = 60 * 1000;

/** How long the next try waits after the 1st, 2nd, 3rd and every later failure: a bucket down for
 *  a minute or for a day is retried without hammering it. */
export const STORAGE_DELETION_BACKOFF_MS: readonly number[] = [
  MINUTE_MS,
  5 * MINUTE_MS,
  30 * MINUTE_MS,
  6 * 60 * MINUTE_MS,
];

/** From this many failures on, each one is logged as an error: someone must look at the bucket. */
export const STORAGE_DELETION_ALERT_ATTEMPTS = 10;

/** Where a removal that failed is told (the Fastify pino logger). */
export type StorageDeletionLog = Readonly<{
  warn: (fields: Readonly<Record<string, unknown>>, message: string) => void;
  error: (fields: Readonly<Record<string, unknown>>, message: string) => void;
}>;

export type StorageDeletionsServiceDeps = Readonly<{
  queue: Pick<StorageDeletionsDao, 'due' | 'forget' | 'postpone'>;
  storage: Pick<AssetStoragePort, 'remove'>;
  clock: ClockPort;
  log: StorageDeletionLog;
  /** Keys tried per read of the queue; a fuller queue is read again. */
  batchSize: number;
}>;

/** What one drain did: objects removed (their keys left the queue) and removals that failed. */
export type StorageDeletionsOutcome = Readonly<{ removed: number; failed: number }>;

/** Empties the queue of objects to remove: a key leaves it only after its `remove` worked; a
 *  failure stays, counts the try and waits longer for the next (never an orphan in silence).
 *
 *  Example: `await deletions.drain() // { removed: 3, failed: 0 }` */
export class StorageDeletionsService {
  constructor(private readonly deps: StorageDeletionsServiceDeps) {}

  async drain(): Promise<StorageDeletionsOutcome> {
    const now = this.deps.clock.now();
    let removed = 0;
    let failed = 0;
    for (;;) {
      // A failed key is postponed past `now`, so the next read never picks it again.
      const due = await this.deps.queue.due(now, this.deps.batchSize);
      for (const row of due) {
        if (await this.tryRemove(row, now)) removed += 1;
        else failed += 1;
      }
      if (due.length < this.deps.batchSize) return { removed, failed };
    }
  }

  private async tryRemove(row: StorageDeletionPo, now: Date): Promise<boolean> {
    try {
      await this.deps.storage.remove(row.key);
    } catch (error) {
      await this.postpone(row, now, error);
      return false;
    }
    await this.deps.queue.forget(row.key);
    return true;
  }

  private async postpone(row: StorageDeletionPo, now: Date, error: unknown): Promise<void> {
    const attempts = row.attempts + 1;
    const nextAttemptAt = new Date(now.getTime() + backoffAfter(attempts));
    await this.deps.queue.postpone(row.key, attempts, nextAttemptAt);
    const fields = { err: error, storageKey: row.key, attempts, nextAttemptAt };
    if (attempts >= STORAGE_DELETION_ALERT_ATTEMPTS) {
      this.deps.log.error(fields, 'storage object still not removed: remove keeps failing');
      return;
    }
    this.deps.log.warn(fields, 'storage object not removed yet: remove failed, will retry');
  }
}

function backoffAfter(attempts: number): number {
  const at = Math.min(attempts, STORAGE_DELETION_BACKOFF_MS.length) - 1;
  return STORAGE_DELETION_BACKOFF_MS[at] ?? MINUTE_MS;
}
