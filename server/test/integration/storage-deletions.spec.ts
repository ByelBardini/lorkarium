import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { storageDeletionsOver } from '../../src/app/wire-asset-sweep';
import { readEnv } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { runInTransaction } from '../../src/database/transaction';
import { S3AssetStorage } from '../../src/infrastructure/asset-storage/s3-asset-storage';
import { StorageDeletionsDao } from '../../src/modules/assets/storage-deletions.dao';
import { storageDeletions } from '../../src/modules/assets/storage-deletions.po';
import { ClockFake } from '../support/auth-fakes';
import { DeletionLogFake } from '../support/storage-deletions-fakes';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const NOW = new Date('2026-11-19T12:00:00Z');
const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
const MINUTES_FROM_NOW = (minutes: number): Date => new Date(NOW.getTime() + minutes * 60_000);

class RolledBackOnPurpose extends Error {}

describe('the storage deletion queue on Postgres', () => {
  let connection: DatabaseConnection;
  let queue: StorageDeletionsDao;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    queue = new StorageDeletionsDao(connection.db);
  });

  afterAll(() => connection.close());

  async function queuedKeys(): Promise<string[]> {
    const rows = await connection.db.select().from(storageDeletions);
    return rows.map((row) => row.key).sort();
  }

  async function queuedAt(key: string, nextAttemptAt: Date): Promise<void> {
    await connection.db.insert(storageDeletions).values({ key, nextAttemptAt });
  }

  it('keys enqueued in a transaction that rolls back leave no row', async () => {
    const work = runInTransaction(connection.db, async (tx) => {
      await new StorageDeletionsDao(tx).enqueue(['assets/a', 'assets/b']);
      throw new RolledBackOnPurpose('the deletion failed after the enqueue');
    });

    await expect(work).rejects.toBeInstanceOf(RolledBackOnPurpose);
    expect(await queuedKeys()).toEqual([]);
  });

  it('the same key enqueued twice is one row, keeping the tries it already had', async () => {
    await queue.enqueue(['assets/a', 'assets/a']);
    await queue.postpone('assets/a', 3, MINUTES_FROM_NOW(30));

    await queue.enqueue(['assets/a', 'assets/b']);

    const rows = await connection.db.select().from(storageDeletions);
    expect(rows.map((row) => [row.key, row.attempts]).sort()).toEqual([
      ['assets/a', 3],
      ['assets/b', 0],
    ]);
  });

  it('due gives only the keys whose try is not in the future, the oldest first, up to the limit', async () => {
    await queuedAt('assets/later', MINUTES_FROM_NOW(1));
    await queuedAt('assets/now', NOW);
    await queuedAt('assets/oldest', MINUTES_FROM_NOW(-60));
    await queuedAt('assets/older', MINUTES_FROM_NOW(-5));

    const due = await queue.due(NOW, 2);

    expect(due.map((row) => row.key)).toEqual(['assets/oldest', 'assets/older']);
    expect((await queue.due(NOW, 10)).map((row) => row.key)).toEqual([
      'assets/oldest',
      'assets/older',
      'assets/now',
    ]);
  });

  it('the drain over the real bucket removes the object and empties the queue', async () => {
    const storage = new S3AssetStorage(readEnv(process.env).storage);
    const key = `assets/${randomUUID()}`;
    await storage.ensureBucket();
    await storage.put(key, PNG_BYTES, 'image/png');
    await queue.enqueue([key]);
    const log = new DeletionLogFake();
    // The key is due from Postgres's now(); the container's clock may run a few ms ahead of ours.
    const clock = new ClockFake(new Date(Date.now() + 60_000));
    const drain = storageDeletionsOver({ db: connection.db, storage, clock, log });

    expect(await drain.drain()).toEqual({ removed: 1, failed: 0 });

    expect(await storage.open(key)).toBeNull();
    expect(await queuedKeys()).toEqual([]);
    storage.destroy();
  });

  it('postpone moves the next try and forget takes the key out', async () => {
    await queue.enqueue(['assets/a', 'assets/b']);

    await queue.postpone('assets/a', 1, MINUTES_FROM_NOW(1));
    await queue.forget('assets/b');

    const rows = await connection.db.select().from(storageDeletions);
    expect(rows).toEqual([
      expect.objectContaining({ key: 'assets/a', attempts: 1, nextAttemptAt: MINUTES_FROM_NOW(1) }),
    ]);
  });
});
