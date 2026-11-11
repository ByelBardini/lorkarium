import type { FastifyInstance } from 'fastify';
import type { Env } from '../config/env';
import {
  type CacheFailure,
  DiskCachedAssetStorage,
} from '../infrastructure/asset-storage/disk-cached-asset-storage';
import { DiskObjectCache } from '../infrastructure/asset-storage/disk-object-cache';
import { S3AssetStorage } from '../infrastructure/asset-storage/s3-asset-storage';
import type { ClockPort } from '../modules/auth/clock.port';
import type { AssetStoragePort } from '../modules/assets/asset-storage.port';

/** The asset storage of one app: S3, behind the disk cache when `env.assetCache` is set. The
 *  bucket and the cache folder are ready before the first request (dev, CI and integration alike).
 *
 *  Example: `const storage = wireAssetStorage(app, env, clock)` */
export function wireAssetStorage(
  app: FastifyInstance,
  env: Env,
  clock: ClockPort,
): AssetStoragePort {
  const s3 = new S3AssetStorage(env.storage);
  app.addHook('onReady', async () => s3.ensureBucket());
  app.addHook('onClose', async () => s3.destroy());
  if (env.assetCache === null) return s3;
  const cache = new DiskObjectCache({ ...env.assetCache, clock });
  app.addHook('onReady', async () => cache.init());
  const onCacheFailure = (failure: CacheFailure): void => logCacheFailure(app, failure);
  return new DiskCachedAssetStorage({ inner: s3, cache, onCacheFailure });
}

// The read already fell back to S3; the warning is how a full or read-only disk shows up.
function logCacheFailure(app: FastifyInstance, failure: CacheFailure): void {
  const { operation, key, error } = failure;
  const reason = error instanceof Error ? error.message : String(error);
  app.log.warn({ operation, key, reason }, 'asset disk cache failed; served from S3');
}
