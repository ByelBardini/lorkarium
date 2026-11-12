import type { ClockPort } from '../auth/clock.port';
import { removeAssetObjects, type AssetRemovalLog } from './asset-object-removal';
import { looseCutoffOf } from './asset-quota.bo';
import type { AssetReferencesDao } from './asset-references.dao';
import type { AssetStoragePort } from './asset-storage.port';

export type AssetSweepDao = Pick<
  AssetReferencesDao,
  'claimSweep' | 'unreferencedOlderThan' | 'deleteUnreferenced'
>;

export type AssetSweepTransactionRunner = <T>(
  work: (references: AssetSweepDao) => Promise<T>,
) => Promise<T>;

export type AssetSweepServiceDeps = Readonly<{
  transaction: AssetSweepTransactionRunner;
  storage: Pick<AssetStoragePort, 'remove'>;
  clock: ClockPort;
  log: AssetRemovalLog;
  /** Files deleted per transaction; a fuller sweep runs another batch. */
  batchSize: number;
}>;

/** What one sweep did: rows deleted and objects removed (a failed removal leaves an orphan). */
export type AssetSweepOutcome = Readonly<{ deleted: number; removed: number }>;

/** Frees the space of files nothing uses: every loose file older than the grace loses its row
 *  and then its object. One sweep at a time across the servers (an advisory lock); another
 *  instance sweeping makes this one return at once.
 *
 *  Example: `await sweep.sweep() // { deleted: 3, removed: 3 }` */
export class AssetSweepService {
  constructor(private readonly deps: AssetSweepServiceDeps) {}

  async sweep(): Promise<AssetSweepOutcome> {
    const cutoff = looseCutoffOf(this.deps.clock.now());
    let deleted = 0;
    let removed = 0;
    for (;;) {
      const batch = await this.deleteBatch(cutoff);
      deleted += batch.keys.length;
      removed += await removeAssetObjects(this.deps.storage, batch.keys, this.deps.log);
      if (!batch.full) return { deleted, removed };
    }
  }

  // The rows go in the transaction; the objects only after its commit (a rollback keeps both).
  private async deleteBatch(cutoff: Date): Promise<{ keys: string[]; full: boolean }> {
    const { batchSize } = this.deps;
    return this.deps.transaction(async (references) => {
      if (!(await references.claimSweep())) return { keys: [], full: false };
      const loose = await references.unreferencedOlderThan(cutoff, batchSize);
      const ids = loose.map((row) => row.id);
      const keys = await references.deleteUnreferenced(ids, cutoff);
      // A batch that deleted nothing would pick the same rows again: the sweep stops there.
      return { keys, full: loose.length === batchSize && keys.length > 0 };
    });
  }
}
