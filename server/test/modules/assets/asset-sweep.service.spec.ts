import { describe, expect, it } from 'vitest';
import {
  AssetSweepService,
  type AssetSweepTransactionRunner,
} from '../../../src/modules/assets/asset-sweep.service';
import {
  AssetSweepDaoFake,
  FlakyRemovalStorageFake,
  QUOTA_NOW,
  RemovalLogFake,
} from '../../support/asset-quota-fakes';
import { ClockFake } from '../../support/auth-fakes';

const CUTOFF = '2026-11-10T12:00:00.000Z';

function looseRows(count: number): { id: string; storageKey: string }[] {
  return Array.from({ length: count }, (_, at) => ({
    id: `asset-${at}`,
    storageKey: `assets/asset-${at}`,
  }));
}

function sweepOver(
  references: AssetSweepDaoFake,
  storage = new FlakyRemovalStorageFake(),
  batchSize = 10,
): {
  service: AssetSweepService;
  storage: FlakyRemovalStorageFake;
  log: RemovalLogFake;
  commits: string[];
} {
  const commits: string[] = [];
  const transaction: AssetSweepTransactionRunner = async (work) => {
    const result = await work(references);
    commits.push(`commit:${storage.removed.length}`);
    return result;
  };
  const log = new RemovalLogFake();
  const clock = new ClockFake(QUOTA_NOW);
  const service = new AssetSweepService({ transaction, storage, clock, log, batchSize });
  return { service, storage, log, commits };
}

describe('AssetSweepService.sweep', () => {
  it('deletes the loose rows older than 24 h and removes their objects after the commit', async () => {
    const references = new AssetSweepDaoFake(looseRows(2));
    const { service, storage, commits } = sweepOver(references);

    expect(await service.sweep()).toEqual({ deleted: 2, removed: 2 });

    expect(references.calls).toEqual([
      'claimSweep',
      `unreferencedOlderThan:${CUTOFF}:10`,
      `deleteUnreferenced:2:${CUTOFF}`,
    ]);
    expect(commits).toEqual(['commit:0']);
    expect(storage.removed).toEqual(['assets/asset-0', 'assets/asset-1']);
  });

  it('another sweep holding the lock makes this one delete nothing', async () => {
    const references = new AssetSweepDaoFake(looseRows(2));
    references.claimable = false;
    const { service, storage } = sweepOver(references);

    expect(await service.sweep()).toEqual({ deleted: 0, removed: 0 });
    expect(references.calls).toEqual(['claimSweep']);
    expect(storage.removed).toEqual([]);
  });

  it('a full batch is followed by another until the loose rows end', async () => {
    const references = new AssetSweepDaoFake(looseRows(5));
    const { service, commits } = sweepOver(references, new FlakyRemovalStorageFake(), 2);

    expect(await service.sweep()).toEqual({ deleted: 5, removed: 5 });
    expect(commits).toHaveLength(3);
  });

  it('a file referenced meanwhile is not deleted, and a batch that deletes nothing stops', async () => {
    const references = new AssetSweepDaoFake(looseRows(2));
    for (const row of references.loose) references.referencedMeanwhile.add(row.id);
    const { service, storage, commits } = sweepOver(references, new FlakyRemovalStorageFake(), 2);

    expect(await service.sweep()).toEqual({ deleted: 0, removed: 0 });
    expect(commits).toHaveLength(1);
    expect(storage.removed).toEqual([]);
  });

  it('a failed removal keeps the row deleted, goes to the log and the others still go', async () => {
    const references = new AssetSweepDaoFake(looseRows(2));
    const storage = new FlakyRemovalStorageFake(new Set(['assets/asset-0']));
    const { service, log } = sweepOver(references, storage);

    expect(await service.sweep()).toEqual({ deleted: 2, removed: 1 });
    expect(references.loose).toEqual([]);
    expect(storage.removed).toEqual(['assets/asset-1']);
    expect(log.warnings).toEqual([
      expect.objectContaining({
        fields: expect.objectContaining({ storageKey: 'assets/asset-0' }),
      }),
    ]);
  });
});
