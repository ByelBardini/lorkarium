import { randomUUID } from 'node:crypto';
import { accountPlanDto } from '@lorkarium/contracts';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { assetSweepOver, storageDeletionsOver } from '../../src/app/wire-asset-sweep';
import { readEnv } from '../../src/config/env';
import { runInTransaction } from '../../src/database/transaction';
import { S3AssetStorage } from '../../src/infrastructure/asset-storage/s3-asset-storage';
import {
  assetReferenceColumns,
  AssetReferencesDao,
} from '../../src/modules/assets/asset-references.dao';
import type { AssetStoragePort } from '../../src/modules/assets/asset-storage.port';
import type { AssetSweepService } from '../../src/modules/assets/asset-sweep.service';
import { assets, type AssetPo } from '../../src/modules/assets/assets.po';
import { storageDeletions } from '../../src/modules/assets/storage-deletions.po';
import { SavedTokensDao } from '../../src/modules/saved-tokens/saved-tokens.dao';
import { scenes } from '../../src/modules/scenes/scenes.po';
import { ClockFake } from '../support/auth-fakes';
import { FlakyRemovalStorageFake } from '../support/asset-quota-fakes';
import { newAssetPo } from '../support/assets-factories';
import { rottenFormPo, savedTokenPo } from '../support/saved-tokens-factories';
import { DeletionLogFake } from '../support/storage-deletions-fakes';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { useTokenTable } from '../support/token-table';

// Ana owns Vharn (Bia and Caio play there); Caio owns Quelm.
const live = useTokenTable();
const HOUR = 60 * 60 * 1000;
const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);

function bucket(): S3AssetStorage {
  return new S3AssetStorage(readEnv(process.env).storage);
}

// A file sent `hoursAgo` hours ago, row and object, that nothing references yet.
async function looseFile(
  storage: AssetStoragePort,
  table: Table,
  hoursAgo: number,
  purpose: AssetPo['purpose'] = 'token',
): Promise<string> {
  const id = randomUUID();
  const storageKey = `assets/${id}`;
  await storage.put(storageKey, PNG_BYTES, 'image/png');
  const createdAt = new Date(Date.now() - hoursAgo * HOUR);
  await live.connection.db
    .insert(assets)
    .values(
      newAssetPo({ id, campaignId: table.id, storageKey, sizeBytes: 700, createdAt, purpose }),
    );
  return id;
}

async function rowExists(assetId: string): Promise<boolean> {
  const rows = await live.connection.db.select().from(assets).where(eq(assets.id, assetId));
  return rows.length === 1;
}

async function storageOf(user: SignedInUser): Promise<number> {
  const response = await live.http(user, { method: 'GET', url: '/api/account/plan' });
  return accountPlanDto.parse(response.json()).usage.storageBytes;
}

function sweep(): AssetSweepService {
  return assetSweepOver({ db: live.connection.db, clock: new ClockFake(new Date()) });
}

// The queue's keys are due from Postgres's now(); the container's clock may run a few ms ahead.
function drainWith(storage: Pick<AssetStoragePort, 'remove'>, log = new DeletionLogFake()) {
  const clock = new ClockFake(new Date(Date.now() + 60_000));
  return storageDeletionsOver({ db: live.connection.db, storage, clock, log });
}

async function queuedKeys(): Promise<string[]> {
  const rows = await live.connection.db.select().from(storageDeletions);
  return rows.map((row) => row.key).sort();
}

describe('the sweep of loose files', () => {
  it('a file nothing uses for 25 h loses its row, its key waits in the queue and the drain removes it', async () => {
    const storage = bucket();
    const loose = await looseFile(storage, live.vharn, 25);
    expect(await storageOf(live.ana)).toBe(0);

    expect(await sweep().sweep()).toEqual({ deleted: 1 });

    expect(await rowExists(loose)).toBe(false);
    expect(await queuedKeys()).toEqual([`assets/${loose}`]);
    expect(await drainWith(storage).drain()).toEqual({ removed: 1, failed: 0 });
    expect(await storage.open(`assets/${loose}`)).toBeNull();
    expect(await queuedKeys()).toEqual([]);
    storage.destroy();
  });

  it('a loose file of 23 h stays, as it still counts against the storage', async () => {
    const storage = bucket();
    const fresh = await looseFile(storage, live.vharn, 23);

    expect(await sweep().sweep()).toEqual({ deleted: 0 });

    expect(await rowExists(fresh)).toBe(true);
    expect(await queuedKeys()).toEqual([]);
    expect(await storageOf(live.ana)).toBe(700);
    storage.destroy();
  });

  it('a chat image of 25 h leaves with its key queued, one of 23 h stays', async () => {
    const storage = bucket();
    const old = await looseFile(storage, live.vharn, 25, 'chat_image');
    const fresh = await looseFile(storage, live.vharn, 23, 'chat_image');

    expect(await sweep().sweep()).toEqual({ deleted: 1 });

    expect(await rowExists(old)).toBe(false);
    expect(await rowExists(fresh)).toBe(true);
    expect(await queuedKeys()).toEqual([`assets/${old}`]);
    storage.destroy();
  });

  it('an old file still used as the background of a grid is not deleted', async () => {
    const storage = bucket();
    const background = await looseFile(storage, live.vharn, 25);
    await live.connection.db
      .update(scenes)
      .set({ backgroundAssetId: background })
      .where(eq(scenes.campaignId, live.vharn.id));

    await sweep().sweep();

    expect(await rowExists(background)).toBe(true);
    expect(await storageOf(live.ana)).toBe(700);
    storage.destroy();
  });

  it('old files used only by a saved token of Bia (portrait and form) are not deleted', async () => {
    const storage = bucket();
    const portrait = await looseFile(storage, live.vharn, 25);
    const formImage = await looseFile(storage, live.vharn, 25);
    const owner = { campaignId: live.vharn.id, userId: live.bia.id };
    await new SavedTokensDao(live.connection.db).insert(
      savedTokenPo(owner, { imageAssetId: portrait }),
      [rottenFormPo(formImage)],
    );

    await sweep().sweep();

    expect(await rowExists(portrait)).toBe(true);
    expect(await rowExists(formImage)).toBe(true);
    storage.destroy();
  });

  it('a failed removal keeps the key in the queue for the next drain (no orphan)', async () => {
    const storage = bucket();
    const loose = await looseFile(storage, live.quelm, 25);
    await sweep().sweep();
    const flaky = new FlakyRemovalStorageFake(new Set([`assets/${loose}`]));
    const log = new DeletionLogFake();

    expect(await drainWith(flaky, log).drain()).toEqual({ removed: 0, failed: 1 });

    expect(await rowExists(loose)).toBe(false);
    expect(await queuedKeys()).toEqual([`assets/${loose}`]);
    expect(log.warnings).toHaveLength(1);
    storage.destroy();
  });

  it('while another sweep holds the lock this one deletes nothing', async () => {
    const storage = bucket();
    const loose = await looseFile(storage, live.vharn, 25);

    const outcome = await runInTransaction(live.connection.db, async (tx) => {
      expect(await new AssetReferencesDao(tx).claimSweep()).toBe(true);
      return sweep().sweep();
    });

    expect(outcome).toEqual({ deleted: 0 });
    expect(await rowExists(loose)).toBe(true);
    storage.destroy();
  });

  it('the referencing columns are exactly the foreign keys to assets in the database', async () => {
    const result = await live.connection.db.execute<{ reference: string }>(sql`
      select c.conrelid::regclass::text || '.' || a.attname as reference
      from pg_constraint c
      cross join lateral unnest(c.conkey, c.confkey) as k(local_key, foreign_key)
      join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = k.foreign_key
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.local_key
      where c.contype = 'f' and c.confrelid = 'assets'::regclass and fa.attname = 'id'`);

    const inDatabase = result.rows.map((row) => row.reference).sort();
    expect([...assetReferenceColumns()].sort()).toEqual(inDatabase);
  });
});

describe('deleting a table', () => {
  it("queues the keys of all its files with the deletion, and the drain leaves the other table's", async () => {
    const storage = bucket();
    const vharnFile = await live.sendImage(live.ana, live.vharn);
    const quelmFile = await live.sendImage(live.caio, live.quelm);
    await live.atTable(live.ana, live.vharn);

    const response = await live.http(live.ana, {
      method: 'DELETE',
      url: `/api/campaigns/${live.vharn.id}`,
    });

    expect(response.statusCode).toBe(204);
    expect(await rowExists(vharnFile.id)).toBe(false);
    expect(await queuedKeys()).toEqual([`assets/${vharnFile.id}`]);
    await drainWith(storage).drain();
    expect(await storage.open(`assets/${vharnFile.id}`)).toBeNull();
    const kept = await storage.open(`assets/${quelmFile.id}`);
    expect(kept).not.toBeNull();
    kept?.body.destroy();
    storage.destroy();
  });
});
