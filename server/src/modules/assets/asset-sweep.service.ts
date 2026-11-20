import type { ClockPort } from '../auth/clock.port';
import { looseCutoffOf } from './asset-quota.bo';
import type { AssetReferencesDao } from './asset-references.dao';
import type { StorageDeletionsDao } from './storage-deletions.dao';

export type AssetSweepDao = Pick<
  AssetReferencesDao,
  'claimSweep' | 'unreferencedOlderThan' | 'deleteUnreferenced'
>;

/** The DAOs of one batch's transaction: the loose rows deleted and their keys queued with them. */
export type AssetSweepScope = Readonly<{
  references: AssetSweepDao;
  deletions: Pick<StorageDeletionsDao, 'enqueue'>;
}>;

export type AssetSweepTransactionRunner = <T>(
  work: (scope: AssetSweepScope) => Promise<T>,
) => Promise<T>;

export type AssetSweepServiceDeps = Readonly<{
  transaction: AssetSweepTransactionRunner;
  clock: ClockPort;
  /** Files deleted per transaction; a fuller sweep runs another batch. */
  batchSize: number;
}>;

/** What one sweep did: rows deleted (their objects wait in the `storage_deletions` queue). */
export type AssetSweepOutcome = Readonly<{ deleted: number }>;

/** Frees the space of files nothing uses: every loose file older than the grace loses its row,
 *  and its key goes to the removal queue in the same transaction. One sweep at a time across the
 *  servers (an advisory lock); another instance sweeping makes this one return at once.
 *
 *  Example: `await sweep.sweep() // { deleted: 3 }` */
export class AssetSweepService {
  constructor(private readonly deps: AssetSweepServiceDeps) {}

  async sweep(): Promise<AssetSweepOutcome> {
    const cutoff = looseCutoffOf(this.deps.clock.now());
    let deleted = 0;
    for (;;) {
      const batch = await this.deleteBatch(cutoff);
      deleted += batch.deleted;
      if (!batch.full) return { deleted };
    }
  }

  // A rollback keeps the rows and drops their keys from the queue: nothing is lost either way.
  private async deleteBatch(cutoff: Date): Promise<{ deleted: number; full: boolean }> {
    const { batchSize } = this.deps;
    return this.deps.transaction(async ({ references, deletions }) => {
      if (!(await references.claimSweep())) return { deleted: 0, full: false };
      const loose = await references.unreferencedOlderThan(cutoff, batchSize);
      const ids = loose.map((row) => row.id);
      const keys = await references.deleteUnreferenced(ids, cutoff);
      await deletions.enqueue(keys);
      // A batch that deleted nothing would pick the same rows again: the sweep stops there.
      return { deleted: keys.length, full: loose.length === batchSize && keys.length > 0 };
    });
  }
}
