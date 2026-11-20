import { asc, eq, inArray, lte } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { storageDeletions, type StorageDeletionPo } from './storage-deletions.po';

/** The queue of objects to take out of the bucket. Whoever deletes a row enqueues its key on the
 *  same `tx`, so the row and the promise to remove its object commit (or roll back) together.
 *
 *  Example: `await new StorageDeletionsDao(tx).enqueue(['assets/<id>'])` */
export class StorageDeletionsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** A key already queued keeps its row and its tries (a second deletion adds nothing). */
  async enqueue(keys: readonly string[]): Promise<void> {
    const unique = [...new Set(keys)];
    if (unique.length === 0) return;
    await this.db
      .insert(storageDeletions)
      .values(unique.map((key) => ({ key })))
      .onConflictDoNothing();
  }

  /** Of the asked keys, those already waiting in the queue; no keys, no query. */
  async queuedAmong(keys: readonly string[]): Promise<string[]> {
    if (keys.length === 0) return [];
    const rows = await this.db
      .select({ key: storageDeletions.key })
      .from(storageDeletions)
      .where(inArray(storageDeletions.key, [...keys]));
    return rows.map((row) => row.key);
  }

  async due(now: Date, limit: number): Promise<StorageDeletionPo[]> {
    return this.db
      .select()
      .from(storageDeletions)
      .where(lte(storageDeletions.nextAttemptAt, now))
      .orderBy(asc(storageDeletions.nextAttemptAt))
      .limit(limit);
  }

  async forget(key: string): Promise<void> {
    await this.db.delete(storageDeletions).where(eq(storageDeletions.key, key));
  }

  async postpone(key: string, attempts: number, nextAttemptAt: Date): Promise<void> {
    await this.db
      .update(storageDeletions)
      .set({ attempts, nextAttemptAt })
      .where(eq(storageDeletions.key, key));
  }
}
