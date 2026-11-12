import type { AssetStoragePort } from './asset-storage.port';

/** Where a removal that failed is told (the Fastify pino logger). */
export type AssetRemovalLog = Readonly<{
  warn: (fields: Readonly<Record<string, unknown>>, message: string) => void;
}>;

/** Removes the objects of rows already deleted (after the commit). A failure does not stop the
 *  others nor bring the row back: the object stays orphaned and goes to the log.
 *
 *  Example: `await removeAssetObjects(storage, ['assets/<id>'], app.log) // 1` */
export async function removeAssetObjects(
  storage: Pick<AssetStoragePort, 'remove'>,
  keys: readonly string[],
  log: AssetRemovalLog,
): Promise<number> {
  let removed = 0;
  for (const key of keys) {
    try {
      await storage.remove(key);
      removed += 1;
    } catch (error) {
      log.warn({ err: error, storageKey: key }, 'asset object left orphaned: remove failed');
    }
  }
  return removed;
}
