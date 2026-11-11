import type { AssetStoragePort, StoredObject } from '../../modules/assets/asset-storage.port';
import type { ObjectCache } from './disk-object-cache';
import { InFlightLoads } from './in-flight-loads';

/** A cache operation that failed; the read, put or remove went on without the cache. */
export type CacheFailure = Readonly<{
  operation: 'read' | 'write' | 'delete';
  key: string;
  error: unknown;
}>;

const UNREADABLE = Symbol('cache unreadable');

export type DiskCachedAssetStorageOptions = Readonly<{
  inner: AssetStoragePort;
  cache: ObjectCache;
  onCacheFailure: (failure: CacheFailure) => void;
}>;

/** The storage with a local copy in front of `open`. Keeping a copy is safe because the bytes
 *  under a key never change, and serving it is safe because whoever calls `open` has already
 *  checked the permission. The storage stays the source of truth: a cache failure is reported,
 *  never thrown.
 *
 *  Example: `new DiskCachedAssetStorage({ inner: s3, cache, onCacheFailure: (f) => log.warn(f) })` */
export class DiskCachedAssetStorage implements AssetStoragePort {
  private readonly inner: AssetStoragePort;
  private readonly cache: ObjectCache;
  private readonly onCacheFailure: (failure: CacheFailure) => void;
  private readonly fills = new InFlightLoads<boolean>();

  constructor(options: DiskCachedAssetStorageOptions) {
    this.inner = options.inner;
    this.cache = options.cache;
    this.onCacheFailure = options.onCacheFailure;
  }

  ensureBucket(): Promise<void> {
    return this.inner.ensureBucket();
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await this.inner.put(key, bytes, contentType);
    await this.guarded('write', key, () => this.cache.writeBytes(key, bytes, contentType));
  }

  /** Serves the kept copy; on a miss, one download per key fills the cache for every caller. */
  async open(key: string): Promise<StoredObject | null> {
    const kept = await this.readKept(key);
    if (kept === UNREADABLE) return this.inner.open(key);
    return kept ?? this.openThroughCache(key);
  }

  async remove(key: string): Promise<void> {
    await this.inner.remove(key);
    await this.guarded('delete', key, () => this.cache.delete(key));
  }

  private async openThroughCache(key: string): Promise<StoredObject | null> {
    const found = await this.fills.run(key, () => this.fill(key));
    if (!found) return null;
    const kept = await this.readKept(key);
    // No copy here means the object is above the cache ceiling or the copy failed: reopen.
    if (kept === null || kept === UNREADABLE) return this.inner.open(key);
    return kept;
  }

  /** `false` when the storage holds nothing under the key. */
  private async fill(key: string): Promise<boolean> {
    const object = await this.inner.open(key);
    if (object === null) return false;
    const { body, size, contentType } = object;
    const kept = await this.guarded('write', key, () =>
      this.cache.write(key, body, size, contentType),
    );
    // A failed copy may leave the body half read; free its connection before reopening.
    if (!kept) body.destroy();
    return true;
  }

  private async readKept(key: string): Promise<StoredObject | null | typeof UNREADABLE> {
    try {
      return await this.cache.read(key);
    } catch (error) {
      this.report('read', key, error);
      return UNREADABLE;
    }
  }

  /** Runs a cache operation; `false` when it failed (already reported). */
  private async guarded(
    operation: CacheFailure['operation'],
    key: string,
    work: () => Promise<void>,
  ): Promise<boolean> {
    try {
      await work();
      return true;
    } catch (error) {
      this.report(operation, key, error);
      return false;
    }
  }

  private report(operation: CacheFailure['operation'], key: string, error: unknown): void {
    this.onCacheFailure({ operation, key, error });
  }
}
