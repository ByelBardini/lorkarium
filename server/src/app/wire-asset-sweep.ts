import type { FastifyInstance } from 'fastify';
import type { Database } from '../database/database';
import { runInTransaction } from '../database/transaction';
import { TimerScheduler } from '../infrastructure/scheduler/timer-scheduler';
import { AssetReferencesDao } from '../modules/assets/asset-references.dao';
import type { AssetStoragePort } from '../modules/assets/asset-storage.port';
import {
  AssetSweepService,
  type AssetSweepTransactionRunner,
} from '../modules/assets/asset-sweep.service';
import { StorageDeletionsDao } from '../modules/assets/storage-deletions.dao';
import {
  StorageDeletionsService,
  type StorageDeletionLog,
} from '../modules/assets/storage-deletions.service';
import type { ClockPort } from '../modules/auth/clock.port';

export const ASSET_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
/** A deleted table's objects leave the bucket within minutes, not at the next hourly sweep. */
export const STORAGE_DELETIONS_INTERVAL_MS = 5 * 60 * 1000;
const ASSET_SWEEP_BATCH = 500;
const STORAGE_DELETIONS_BATCH = 100;

export type StorageDeletionsWiring = Readonly<{
  db: Database;
  storage: Pick<AssetStoragePort, 'remove'>;
  clock: ClockPort;
  log: StorageDeletionLog;
}>;

/** The sweep over the real tables: each batch in its own transaction, with the queue on its `tx`.
 *
 *  Example: `await assetSweepOver({ db, clock }).sweep()` */
export function assetSweepOver(
  wiring: Readonly<{ db: Database; clock: ClockPort }>,
): AssetSweepService {
  const { db, clock } = wiring;
  const transaction: AssetSweepTransactionRunner = (work) =>
    runInTransaction(db, (tx) =>
      work({ references: new AssetReferencesDao(tx), deletions: new StorageDeletionsDao(tx) }),
    );
  return new AssetSweepService({ transaction, clock, batchSize: ASSET_SWEEP_BATCH });
}

/** The drain of the `storage_deletions` queue over the real table and bucket.
 *
 *  Example: `await storageDeletionsOver({ db, storage, clock, log: app.log }).drain()` */
export function storageDeletionsOver(wiring: StorageDeletionsWiring): StorageDeletionsService {
  const { db, storage, clock, log } = wiring;
  const queue = new StorageDeletionsDao(db);
  return new StorageDeletionsService({
    ...{ queue, storage, clock, log, batchSize: STORAGE_DELETIONS_BATCH },
  });
}

/** Sweeps the loose files once an hour and drains the queue of objects to remove every 5
 *  minutes, from the app's `onReady` until its `onClose` (each first run one interval after the
 *  boot); a failed run goes to the log and the next one still runs.
 *
 *  Example: `wireAssetSweep(app, { db: deps.db, storage, clock })` */
export function wireAssetSweep(
  app: FastifyInstance,
  wiring: Omit<StorageDeletionsWiring, 'log'>,
): void {
  const sweep = assetSweepOver(wiring);
  const deletions = storageDeletionsOver({ ...wiring, log: app.log });
  const repeat = repeaterOn(app);
  repeat('asset-sweep', ASSET_SWEEP_INTERVAL_MS, () => sweep.sweep());
  repeat('storage-deletions', STORAGE_DELETIONS_INTERVAL_MS, () => deletions.drain());
}

type Repeater = (name: string, intervalMs: number, run: () => Promise<unknown>) => void;

// Each job schedules its next run only after the current one settles: two runs never overlap.
function repeaterOn(app: FastifyInstance): Repeater {
  const scheduler = new TimerScheduler();
  let closed = false;
  app.addHook('onClose', async () => {
    closed = true;
    scheduler.cancelAll();
  });
  return (name, intervalMs, run) => {
    const scheduleNext = (): void => {
      if (!closed) scheduler.schedule(name, intervalMs, runThenScheduleNext);
    };
    const runThenScheduleNext = (): void => {
      run()
        .catch((error: unknown) => app.log.error({ err: error }, `${name} failed`))
        .finally(scheduleNext);
    };
    app.addHook('onReady', async () => scheduleNext());
  };
}
