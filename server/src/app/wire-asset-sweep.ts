import type { FastifyInstance } from 'fastify';
import type { Database } from '../database/database';
import { runInTransaction } from '../database/transaction';
import { TimerScheduler } from '../infrastructure/scheduler/timer-scheduler';
import type { AssetRemovalLog } from '../modules/assets/asset-object-removal';
import { AssetReferencesDao } from '../modules/assets/asset-references.dao';
import type { AssetStoragePort } from '../modules/assets/asset-storage.port';
import { AssetSweepService } from '../modules/assets/asset-sweep.service';
import type { ClockPort } from '../modules/auth/clock.port';

export const ASSET_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const ASSET_SWEEP_BATCH = 500;

export type AssetSweepWiring = Readonly<{
  db: Database;
  storage: Pick<AssetStoragePort, 'remove'>;
  clock: ClockPort;
  log: AssetRemovalLog;
}>;

/** The sweep over the real tables: each batch in its own transaction.
 *
 *  Example: `await assetSweepOver({ db, storage, clock, log: app.log }).sweep()` */
export function assetSweepOver(wiring: AssetSweepWiring): AssetSweepService {
  const { db, storage, clock, log } = wiring;
  return new AssetSweepService({
    transaction: (work) => runInTransaction(db, (tx) => work(new AssetReferencesDao(tx))),
    ...{ storage, clock, log, batchSize: ASSET_SWEEP_BATCH },
  });
}

/** Sweeps the loose files once an hour, from the app's `onReady` until its `onClose` (the
 *  first run an hour after the boot); a failed sweep goes to the log and the next one still runs.
 *
 *  Example: `wireAssetSweep(app, { db: deps.db, storage, clock })` */
export function wireAssetSweep(app: FastifyInstance, wiring: Omit<AssetSweepWiring, 'log'>): void {
  const sweep = assetSweepOver({ ...wiring, log: app.log });
  const scheduler = new TimerScheduler();
  let closed = false;
  const runThenScheduleNext = (): void => {
    sweep
      .sweep()
      .catch((error: unknown) => app.log.error({ err: error }, 'asset sweep failed'))
      .finally(scheduleNext);
  };
  const scheduleNext = (): void => {
    if (!closed) scheduler.schedule('asset-sweep', ASSET_SWEEP_INTERVAL_MS, runThenScheduleNext);
  };
  app.addHook('onReady', async () => scheduleNext());
  app.addHook('onClose', async () => {
    closed = true;
    scheduler.cancelAll();
  });
}
