import type { ClockPort } from '../auth/clock.port';
import type { AssetStoragePort, ListedObject } from './asset-storage.port';
import type { AssetsDao } from './assets.dao';
import { orphanKeysOf, TABLE_FILE_PREFIX } from './orphan-objects.bo';
import { RemoveOrphanObjectsRefusedError } from './orphan-objects.error';
import type { StorageDeletionsDao } from './storage-deletions.dao';

export type OrphanObjectsDeps = Readonly<{
  storage: Pick<AssetStoragePort, 'listKeys'>;
  assets: Pick<AssetsDao, 'storageKeysAmong'>;
  deletions: Pick<StorageDeletionsDao, 'queuedAmong' | 'enqueue'>;
  clock: ClockPort;
  /** Bucket keys checked against the database per query. */
  chunkSize: number;
}>;

/** `dryRun` is `--dry-run` (list only), `confirmed` is `--yes` (queue the removals). */
export type OrphanObjectsRun = Readonly<{ dryRun: boolean; confirmed: boolean; nodeEnv: string }>;

/** `listed` counts the table files in the bucket; `enqueued`, the orphans queued (0 in a dry run). */
export type OrphanObjectsReport = Readonly<{
  listed: number;
  orphans: readonly string[];
  enqueued: number;
}>;

/** Finds the table files left in the bucket by deletions that removed the row before the removal
 *  queue existed, and queues them: the app's drain takes them out (and their disk-cache copies).
 *
 *  Example: `await new OrphanObjectsService(deps).run({ dryRun: true, confirmed: false, nodeEnv })` */
export class OrphanObjectsService {
  constructor(private readonly deps: OrphanObjectsDeps) {}

  async run(options: OrphanObjectsRun): Promise<OrphanObjectsReport> {
    requireAllowed(options);
    const now = this.deps.clock.now();
    const stored = await this.deps.storage.listKeys(TABLE_FILE_PREFIX);
    const orphans: string[] = [];
    for (let at = 0; at < stored.length; at += this.deps.chunkSize) {
      orphans.push(...(await this.orphansAmong(stored.slice(at, at + this.deps.chunkSize), now)));
    }
    if (!options.dryRun) await this.deps.deletions.enqueue(orphans);
    const enqueued = options.dryRun ? 0 : orphans.length;
    return { listed: stored.length, orphans, enqueued };
  }

  private async orphansAmong(chunk: readonly ListedObject[], now: Date): Promise<string[]> {
    const keys = chunk.map((object) => object.key);
    const rowKeys = new Set(await this.deps.assets.storageKeysAmong(keys));
    const queuedKeys = new Set(await this.deps.deletions.queuedAmong(keys));
    return orphanKeysOf({ stored: chunk, rowKeys, queuedKeys, now });
  }
}

// A dry run writes nothing, so it passes anywhere; queuing the removals takes the `--yes`.
function requireAllowed(options: OrphanObjectsRun): void {
  if (options.dryRun || options.confirmed) return;
  throw new RemoveOrphanObjectsRefusedError(options.nodeEnv);
}
