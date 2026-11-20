import type { StorageDeletionsDao } from '../../src/modules/assets/storage-deletions.dao';
import type { StorageDeletionPo } from '../../src/modules/assets/storage-deletions.po';
import type { StorageDeletionLog } from '../../src/modules/assets/storage-deletions.service';

export const DELETIONS_NOW = new Date('2026-11-19T12:00:00Z');

/** One queued key, due at `DELETIONS_NOW` with no failed try unless the spec says otherwise.
 *
 *  Example: `storageDeletionPo({ key: 'assets/a', attempts: 3 })` */
export function storageDeletionPo(overrides: Partial<StorageDeletionPo> = {}): StorageDeletionPo {
  return {
    key: 'assets/a',
    attempts: 0,
    nextAttemptAt: DELETIONS_NOW,
    enqueuedAt: DELETIONS_NOW,
    ...overrides,
  };
}

/** The `storage_deletions` table in memory: `due` gives the rows whose try is not in the future,
 *  oldest first; `enqueue` ignores a key already there (like the `ON CONFLICT DO NOTHING`).
 *
 *  Example: `new StorageDeletionQueueFake([storageDeletionPo({ key: 'assets/a' })])` */
export class StorageDeletionQueueFake implements Pick<
  StorageDeletionsDao,
  'enqueue' | 'due' | 'forget' | 'postpone' | 'queuedAmong'
> {
  readonly rows: StorageDeletionPo[];
  /** How many keys each `queuedAmong` was asked about, in order. */
  readonly askedAmong: number[] = [];

  constructor(rows: StorageDeletionPo[] = []) {
    this.rows = [...rows];
  }

  keys(): string[] {
    return this.rows.map((row) => row.key);
  }

  async queuedAmong(keys: readonly string[]): Promise<string[]> {
    this.askedAmong.push(keys.length);
    return keys.filter((key) => this.rows.some((row) => row.key === key));
  }

  async enqueue(keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      if (this.rows.some((row) => row.key === key)) continue;
      this.rows.push(storageDeletionPo({ key }));
    }
  }

  async due(now: Date, limit: number): Promise<StorageDeletionPo[]> {
    return this.rows
      .filter((row) => row.nextAttemptAt.getTime() <= now.getTime())
      .sort((a, b) => a.nextAttemptAt.getTime() - b.nextAttemptAt.getTime())
      .slice(0, limit);
  }

  async forget(key: string): Promise<void> {
    const at = this.rows.findIndex((row) => row.key === key);
    if (at >= 0) this.rows.splice(at, 1);
  }

  async postpone(key: string, attempts: number, nextAttemptAt: Date): Promise<void> {
    const at = this.rows.findIndex((row) => row.key === key);
    const row = this.rows[at];
    if (row) this.rows[at] = { ...row, attempts, nextAttemptAt };
  }
}

/** The queue as a transaction sees it: `enqueue` stages the keys; the transaction fake that owns
 *  it calls `commit` (the keys reach `committed`) or `rollback` (they are dropped).
 *
 *  Example: `deletions.committed // ['assets/a'] once the work resolved` */
export class StagedDeletionQueueFake implements Pick<StorageDeletionsDao, 'enqueue'> {
  readonly committed: string[] = [];
  private staged: string[] = [];

  async enqueue(keys: readonly string[]): Promise<void> {
    this.staged.push(...keys);
  }

  commit(): void {
    this.committed.push(...this.staged);
    this.staged = [];
  }

  rollback(): void {
    this.staged = [];
  }

  /** Runs `work` as one transaction over this queue: commit when it resolves, rollback when it throws. */
  async around<T>(work: () => Promise<T>): Promise<T> {
    try {
      const result = await work();
      this.commit();
      return result;
    } catch (error) {
      this.rollback();
      throw error;
    }
  }
}

type LoggedLine = Readonly<{ fields: Readonly<Record<string, unknown>>; message: string }>;

/** Keeps every warning and error written, with its fields. */
export class DeletionLogFake implements StorageDeletionLog {
  readonly warnings: LoggedLine[] = [];
  readonly errors: LoggedLine[] = [];

  warn(fields: Readonly<Record<string, unknown>>, message: string): void {
    this.warnings.push({ fields, message });
  }

  error(fields: Readonly<Record<string, unknown>>, message: string): void {
    this.errors.push({ fields, message });
  }
}
