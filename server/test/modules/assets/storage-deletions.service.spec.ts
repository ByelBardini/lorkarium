import { describe, expect, it } from 'vitest';
import { StorageDeletionsService } from '../../../src/modules/assets/storage-deletions.service';
import { FlakyRemovalStorageFake } from '../../support/asset-quota-fakes';
import { ClockFake } from '../../support/auth-fakes';
import {
  DELETIONS_NOW,
  DeletionLogFake,
  StorageDeletionQueueFake,
  storageDeletionPo,
} from '../../support/storage-deletions-fakes';

const MINUTE = 60 * 1000;

function drainOver(
  queue: StorageDeletionQueueFake,
  storage = new FlakyRemovalStorageFake(),
  batchSize = 10,
): { service: StorageDeletionsService; storage: FlakyRemovalStorageFake; log: DeletionLogFake } {
  const log = new DeletionLogFake();
  const clock = new ClockFake(DELETIONS_NOW);
  const service = new StorageDeletionsService({ queue, storage, clock, log, batchSize });
  return { service, storage, log };
}

function failingOn(...keys: string[]): FlakyRemovalStorageFake {
  return new FlakyRemovalStorageFake(new Set(keys));
}

describe('StorageDeletionsService.drain', () => {
  it('removes every due object and takes its key out of the queue', async () => {
    const queue = new StorageDeletionQueueFake([
      storageDeletionPo({ key: 'assets/a' }),
      storageDeletionPo({ key: 'avatars/b' }),
    ]);
    const { service, storage } = drainOver(queue);

    expect(await service.drain()).toEqual({ removed: 2, failed: 0 });

    expect(storage.removed).toEqual(['assets/a', 'avatars/b']);
    expect(queue.keys()).toEqual([]);
  });

  it('a removal that fails keeps the key, counts the try and waits a minute for the next', async () => {
    const queue = new StorageDeletionQueueFake([
      storageDeletionPo({ key: 'assets/a' }),
      storageDeletionPo({ key: 'assets/b' }),
    ]);
    const { service, storage, log } = drainOver(queue, failingOn('assets/a'));

    expect(await service.drain()).toEqual({ removed: 1, failed: 1 });

    expect(storage.removed).toEqual(['assets/b']);
    expect(queue.rows).toEqual([
      storageDeletionPo({
        key: 'assets/a',
        attempts: 1,
        nextAttemptAt: new Date('2026-11-19T12:01:00Z'),
      }),
    ]);
    expect(log.warnings).toEqual([
      expect.objectContaining({ fields: expect.objectContaining({ storageKey: 'assets/a' }) }),
    ]);
  });

  it.each([
    [1, 5 * MINUTE],
    [2, 30 * MINUTE],
    [3, 360 * MINUTE],
    [7, 360 * MINUTE],
  ])('after %i failed tries the next failure waits %i ms', async (attempts, waitMs) => {
    const queue = new StorageDeletionQueueFake([storageDeletionPo({ key: 'assets/a', attempts })]);
    const { service } = drainOver(queue, failingOn('assets/a'));

    await service.drain();

    expect(queue.rows[0]?.attempts).toBe(attempts + 1);
    expect(queue.rows[0]?.nextAttemptAt).toEqual(new Date(DELETIONS_NOW.getTime() + waitMs));
  });

  it('a key whose next try is still in the future is not tried', async () => {
    const later = new Date('2026-11-19T12:00:01Z');
    const queue = new StorageDeletionQueueFake([
      storageDeletionPo({ key: 'assets/a', nextAttemptAt: later }),
    ]);
    const { service, storage } = drainOver(queue);

    expect(await service.drain()).toEqual({ removed: 0, failed: 0 });

    expect(storage.removed).toEqual([]);
    expect(queue.keys()).toEqual(['assets/a']);
  });

  it('the tenth failure goes to the log as an error and the key still stays in the queue', async () => {
    const queue = new StorageDeletionQueueFake([
      storageDeletionPo({ key: 'assets/a', attempts: 9 }),
    ]);
    const { service, log } = drainOver(queue, failingOn('assets/a'));

    await service.drain();

    expect(queue.rows).toEqual([expect.objectContaining({ key: 'assets/a', attempts: 10 })]);
    expect(log.warnings).toEqual([]);
    expect(log.errors).toEqual([
      expect.objectContaining({
        fields: expect.objectContaining({ storageKey: 'assets/a', attempts: 10 }),
      }),
    ]);
  });

  it('the ninth failure is still only a warning', async () => {
    const queue = new StorageDeletionQueueFake([
      storageDeletionPo({ key: 'assets/a', attempts: 8 }),
    ]);
    const { service, log } = drainOver(queue, failingOn('assets/a'));

    await service.drain();

    expect(log.errors).toEqual([]);
    expect(log.warnings).toHaveLength(1);
  });

  it('a queue longer than one batch is drained batch after batch', async () => {
    const queue = new StorageDeletionQueueFake(
      ['assets/a', 'assets/b', 'assets/c', 'assets/d', 'assets/e'].map((key) =>
        storageDeletionPo({ key }),
      ),
    );
    const { service } = drainOver(queue, new FlakyRemovalStorageFake(), 2);

    expect(await service.drain()).toEqual({ removed: 5, failed: 0 });
    expect(queue.keys()).toEqual([]);
  });
});
