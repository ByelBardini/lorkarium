import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DiskObjectCache,
  type ObjectCache,
} from '../../../src/infrastructure/asset-storage/disk-object-cache';
import {
  type CacheFailure,
  DiskCachedAssetStorage,
} from '../../../src/infrastructure/asset-storage/disk-cached-asset-storage';
import type { StoredObject } from '../../../src/modules/assets/asset-storage.port';
import {
  CountingAssetStorageFake,
  drained,
  ObjectCacheFailingFake,
  ObjectCacheMemoryFake,
} from '../../support/asset-cache-fakes';
import { ClockFake } from '../../support/auth-fakes';

const KEY = 'assets/u1';
const BYTES = Uint8Array.from([137, 80, 78, 71, 1, 2, 3, 4]);

type Rig = Readonly<{
  storage: DiskCachedAssetStorage;
  inner: CountingAssetStorageFake;
  failures: CacheFailure[];
}>;

function rigWith(cache: ObjectCache): Rig {
  const inner = new CountingAssetStorageFake();
  const failures: CacheFailure[] = [];
  const onCacheFailure = (failure: CacheFailure): void => void failures.push(failure);
  return { storage: new DiskCachedAssetStorage({ inner, cache, onCacheFailure }), inner, failures };
}

function rigWithStoredKey(cache: ObjectCache): Rig {
  const rig = rigWith(cache);
  rig.inner.objects.set(KEY, { bytes: BYTES, contentType: 'image/png' });
  return rig;
}

async function contentOf(object: StoredObject | null): Promise<unknown> {
  if (object === null) return null;
  const bytes = [...(await drained(object.body))];
  return { bytes, size: object.size, contentType: object.contentType };
}

const EXPECTED = { bytes: [...BYTES], size: BYTES.byteLength, contentType: 'image/png' };

const cacheDirs: string[] = [];

afterEach(async () => {
  await Promise.all(cacheDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function diskCache(maxBytes = 1024): Promise<DiskObjectCache> {
  const dir = await mkdtemp(path.join(tmpdir(), 'lorkarium-asset-cache-'));
  cacheDirs.push(dir);
  const cache = new DiskObjectCache({ dir, maxBytes, clock: new ClockFake(new Date()) });
  await cache.init();
  return cache;
}

describe('DiskCachedAssetStorage', () => {
  it('opens the storage once for two opens of the same key in a row, serving the same bytes', async () => {
    const { storage, inner } = rigWithStoredKey(await diskCache());

    expect(await contentOf(await storage.open(KEY))).toEqual(EXPECTED);
    expect(await contentOf(await storage.open(KEY))).toEqual(EXPECTED);

    expect(inner.opens).toBe(1);
  });

  it('puts into the storage and the cache, so the next open does not reach the storage', async () => {
    const cache = await diskCache();
    const { storage, inner } = rigWith(cache);

    await storage.put(KEY, BYTES, 'image/png');

    expect(inner.objects.get(KEY)).toEqual({ bytes: BYTES, contentType: 'image/png' });
    expect(await contentOf(await cache.read(KEY))).toEqual(EXPECTED);
    expect(await contentOf(await storage.open(KEY))).toEqual(EXPECTED);
    expect(inner.opens).toBe(0);
  });

  it('answers null for a key the storage lacks and keeps nothing', async () => {
    const cache = await diskCache();
    const { storage, inner } = rigWith(cache);

    expect(await storage.open('assets/missing')).toBeNull();

    expect(await cache.read('assets/missing')).toBeNull();
    expect(inner.opens).toBe(1);
  });

  it('opens the storage once for two simultaneous opens of the same cold key', async () => {
    const { storage, inner } = rigWithStoredKey(await diskCache());

    const both = await Promise.all([storage.open(KEY), storage.open(KEY)]);

    expect(await Promise.all(both.map(contentOf))).toEqual([EXPECTED, EXPECTED]);
    expect(inner.opens).toBe(1);
  });

  it('removes from the storage and the cache, so the next open asks the storage and gets null', async () => {
    const cache = await diskCache();
    const { storage, inner } = rigWith(cache);
    await storage.put(KEY, BYTES, 'image/png');

    await storage.remove(KEY);

    expect(inner.objects.has(KEY)).toBe(false);
    expect(await storage.open(KEY)).toBeNull();
    expect(inner.opens).toBe(1);
  });

  it('reopens from the storage an object above the cache ceiling, which is not kept', async () => {
    const cache = await diskCache(BYTES.byteLength - 1);
    const { storage, inner, failures } = rigWithStoredKey(cache);

    expect(await contentOf(await storage.open(KEY))).toEqual(EXPECTED);

    expect(await cache.read(KEY)).toBeNull();
    expect(inner.opens).toBe(2);
    expect(failures).toEqual([]);
  });

  it('serves the whole object reopened from the storage when the cache fails to write it', async () => {
    const cache = new ObjectCacheFailingFake({ write: true });
    const { storage, inner, failures } = rigWithStoredKey(cache);

    expect(await contentOf(await storage.open(KEY))).toEqual(EXPECTED);

    expect(inner.opens).toBe(2);
    expect(inner.bodies[0]?.destroyed).toBe(true);
    expect(failures).toEqual([{ operation: 'write', key: KEY, error: cache.error }]);
  });

  it('serves from the storage and reports when the cache fails to read', async () => {
    const cache = new ObjectCacheFailingFake({ read: true });
    const { storage, failures } = rigWithStoredKey(cache);

    expect(await contentOf(await storage.open(KEY))).toEqual(EXPECTED);

    expect(failures[0]).toEqual({ operation: 'read', key: KEY, error: cache.error });
  });

  it('passes the storage failure on to the caller', async () => {
    const { storage, inner } = rigWithStoredKey(new ObjectCacheMemoryFake());
    const outage = new Error('S3 GetObject failed with 503 (expected 200)');
    inner.openFailure = outage;

    await expect(storage.open(KEY)).rejects.toBe(outage);
  });

  it('puts into the storage and only reports when the cache fails to keep the bytes', async () => {
    const cache = new ObjectCacheFailingFake({ writeBytes: true });
    const { storage, inner, failures } = rigWith(cache);

    await storage.put(KEY, BYTES, 'image/png');

    expect(inner.objects.has(KEY)).toBe(true);
    expect(failures).toEqual([{ operation: 'write', key: KEY, error: cache.error }]);
  });

  it('removes from the storage and only reports when the cache fails to delete', async () => {
    const cache = new ObjectCacheFailingFake({ delete: true });
    const { storage, inner, failures } = rigWithStoredKey(cache);

    await storage.remove(KEY);

    expect(inner.objects.has(KEY)).toBe(false);
    expect(failures).toEqual([{ operation: 'delete', key: KEY, error: cache.error }]);
  });

  it('delegates ensureBucket to the storage', async () => {
    const { storage, inner } = rigWith(new ObjectCacheMemoryFake());

    await storage.ensureBucket();

    expect(inner.ensures).toBe(1);
  });
});
