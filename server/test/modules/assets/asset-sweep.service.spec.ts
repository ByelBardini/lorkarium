import { describe, expect, it } from 'vitest';
import {
  AssetSweepService,
  type AssetSweepTransactionRunner,
} from '../../../src/modules/assets/asset-sweep.service';
import { AssetSweepDaoFake, QUOTA_NOW } from '../../support/asset-quota-fakes';
import { ClockFake } from '../../support/auth-fakes';
import { StagedDeletionQueueFake } from '../../support/storage-deletions-fakes';

const CUTOFF = '2026-11-10T12:00:00.000Z';

function looseRows(count: number): { id: string; storageKey: string }[] {
  return Array.from({ length: count }, (_, at) => ({
    id: `asset-${at}`,
    storageKey: `assets/asset-${at}`,
  }));
}

function sweepOver(
  references: AssetSweepDaoFake,
  batchSize = 10,
): { service: AssetSweepService; deletions: StagedDeletionQueueFake; commits: string[] } {
  const commits: string[] = [];
  const deletions = new StagedDeletionQueueFake();
  const transaction: AssetSweepTransactionRunner = async (work) => {
    const result = await deletions.around(() => work({ references, deletions }));
    commits.push(`commit:${deletions.committed.length}`);
    return result;
  };
  const clock = new ClockFake(QUOTA_NOW);
  const service = new AssetSweepService({ transaction, clock, batchSize });
  return { service, deletions, commits };
}

describe('AssetSweepService.sweep', () => {
  it('deletes the loose rows older than 24 h and queues their keys in the same transaction', async () => {
    const references = new AssetSweepDaoFake(looseRows(2));
    const { service, deletions, commits } = sweepOver(references);

    expect(await service.sweep()).toEqual({ deleted: 2 });

    expect(references.calls).toEqual([
      'claimSweep',
      `unreferencedOlderThan:${CUTOFF}:10`,
      `deleteUnreferenced:2:${CUTOFF}`,
    ]);
    expect(commits).toEqual(['commit:2']);
    expect(deletions.committed).toEqual(['assets/asset-0', 'assets/asset-1']);
  });

  it('another sweep holding the lock makes this one delete nothing', async () => {
    const references = new AssetSweepDaoFake(looseRows(2));
    references.claimable = false;
    const { service, deletions } = sweepOver(references);

    expect(await service.sweep()).toEqual({ deleted: 0 });
    expect(references.calls).toEqual(['claimSweep']);
    expect(deletions.committed).toEqual([]);
  });

  it('a full batch is followed by another until the loose rows end, each queuing its own keys', async () => {
    const references = new AssetSweepDaoFake(looseRows(5));
    const { service, commits } = sweepOver(references, 2);

    expect(await service.sweep()).toEqual({ deleted: 5 });
    expect(commits).toEqual(['commit:2', 'commit:4', 'commit:5']);
  });

  it('a file referenced meanwhile is not deleted nor queued, and a batch that deletes nothing stops', async () => {
    const references = new AssetSweepDaoFake(looseRows(2));
    for (const row of references.loose) references.referencedMeanwhile.add(row.id);
    const { service, deletions, commits } = sweepOver(references, 2);

    expect(await service.sweep()).toEqual({ deleted: 0 });
    expect(commits).toHaveLength(1);
    expect(deletions.committed).toEqual([]);
  });
});
