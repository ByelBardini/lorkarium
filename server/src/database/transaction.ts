import type { Database } from './database';

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** What a DAO runs its queries on: the pool-backed client or an open transaction. */
export type DatabaseExecutor = Database | Transaction;

/** Runs `work` in one transaction: commits when it resolves, rolls back and rethrows when it throws.
 *  The service opens it; the DAOs only receive the `tx`.
 *
 *  Example: `await runInTransaction(db, (tx) => new CampaignsDao(tx).insert(row))` */
export async function runInTransaction<T>(
  db: Database,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(work);
}

/** Runs `work` in one `repeatable read`, `read only` transaction: every read sees the same instant,
 *  and a write in it fails (`25006`). For a snapshot built from many queries (the board sync).
 *
 *  Example: `await runInSnapshot(db, (tx) => new ScenesDao(tx).findActiveOf(campaignId))` */
export async function runInSnapshot<T>(
  db: Database,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(work, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}
