import { describe, expect, it } from 'vitest';
import { OrphanObjectsService } from '../../../src/modules/assets/orphan-objects.service';
import { AssetStorageFake } from '../../support/assets-fakes';
import { ClockFake } from '../../support/auth-fakes';
import { AssetRowKeysFake } from '../../support/orphan-objects-fakes';
import { StorageDeletionQueueFake, storageDeletionPo } from '../../support/storage-deletions-fakes';

const NOW = new Date('2026-11-19T12:00:00Z');
const OLD = new Date('2026-11-01T12:00:00Z');
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);

type Rig = Readonly<{ service: OrphanObjectsService; deletions: StorageDeletionQueueFake }>;

// The bucket holds a (with a row), b (queued), c and d (orphans) and an avatar; all a month old.
async function rig(chunkSize = 100): Promise<Rig> {
  const storage = new AssetStorageFake();
  storage.storedAt = OLD;
  for (const key of ['assets/a', 'assets/b', 'assets/c', 'assets/d', 'avatars/x']) {
    await storage.put(key, PNG, 'image/png');
  }
  const assets = new AssetRowKeysFake(['assets/a']);
  const deletions = new StorageDeletionQueueFake([storageDeletionPo({ key: 'assets/b' })]);
  const clock = new ClockFake(NOW);
  const service = new OrphanObjectsService({ storage, assets, deletions, clock, chunkSize });
  return { service, deletions };
}

describe('OrphanObjectsService.run', () => {
  it('--dry-run lists the orphans and queues nothing', async () => {
    const { service, deletions } = await rig();

    const report = await service.run({ dryRun: true, confirmed: false, nodeEnv: 'development' });

    expect(report).toEqual({ listed: 4, orphans: ['assets/c', 'assets/d'], enqueued: 0 });
    expect(deletions.keys()).toEqual(['assets/b']);
  });

  it('--yes queues the orphans for the drain', async () => {
    const { service, deletions } = await rig();

    const report = await service.run({ dryRun: false, confirmed: true, nodeEnv: 'development' });

    expect(report).toEqual({ listed: 4, orphans: ['assets/c', 'assets/d'], enqueued: 2 });
    expect(deletions.keys()).toEqual(['assets/b', 'assets/c', 'assets/d']);
  });

  it('a bucket larger than a chunk is checked a chunk at a time', async () => {
    const { service, deletions } = await rig(3);

    const report = await service.run({ dryRun: false, confirmed: true, nodeEnv: 'development' });

    expect(report.orphans).toEqual(['assets/c', 'assets/d']);
    expect(deletions.askedAmong).toEqual([3, 1]);
  });

  it('without --dry-run nor --yes it is refused citing both, and nothing is listed', async () => {
    const { service, deletions } = await rig();

    const run = service.run({ dryRun: false, confirmed: false, nodeEnv: 'development' });

    await expect(run).rejects.toMatchObject({
      code: 'REMOVE_ORPHAN_OBJECTS_REFUSED',
      message: expect.stringMatching(/--dry-run.*--yes/),
    });
    expect(deletions.askedAmong).toEqual([]);
  });

  it('in production without --yes it is refused citing NODE_ENV', async () => {
    const { service, deletions } = await rig();

    const run = service.run({ dryRun: false, confirmed: false, nodeEnv: 'production' });

    await expect(run).rejects.toMatchObject({
      code: 'REMOVE_ORPHAN_OBJECTS_REFUSED',
      message: expect.stringContaining('NODE_ENV=production'),
    });
    expect(deletions.keys()).toEqual(['assets/b']);
  });

  it('in production --dry-run still lists, since it writes nothing', async () => {
    const { service } = await rig();

    const report = await service.run({ dryRun: true, confirmed: false, nodeEnv: 'production' });

    expect(report.orphans).toEqual(['assets/c', 'assets/d']);
  });
});
