import { looseCutoffOf } from './asset-quota.bo';
import type { ListedObject } from './asset-storage.port';

/** The prefix of every table file (`storageKeyOf`); the account images live under others. */
export const TABLE_FILE_PREFIX = 'assets/';

/** What decides whether a listed object is an orphan: the keys that still have a row in
 *  `assets`, the keys already waiting in the removal queue, and the instant of the check. */
export type OrphanCheck = Readonly<{
  stored: readonly ListedObject[];
  rowKeys: ReadonlySet<string>;
  queuedKeys: ReadonlySet<string>;
  now: Date;
}>;

/** The table files left in the bucket with no row and no queued removal. An object written less
 *  than 24 h ago is spared: an upload puts the object before its row commits.
 *
 *  Example: `orphanKeysOf({ stored, rowKeys, queuedKeys, now }) // ['assets/<id>']` */
export function orphanKeysOf(check: OrphanCheck): string[] {
  const cutoff = looseCutoffOf(check.now).getTime();
  return check.stored
    .filter((object) => object.key.startsWith(TABLE_FILE_PREFIX))
    .filter((object) => object.lastModified.getTime() <= cutoff)
    .filter((object) => !check.rowKeys.has(object.key) && !check.queuedKeys.has(object.key))
    .map((object) => object.key);
}
