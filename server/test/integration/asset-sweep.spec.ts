import { randomUUID } from 'node:crypto';
import { accountPlanDto } from '@lorkarium/contracts';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { assetSweepOver } from '../../src/app/wire-asset-sweep';
import { readEnv } from '../../src/config/env';
import { runInTransaction } from '../../src/database/transaction';
import { S3AssetStorage } from '../../src/infrastructure/asset-storage/s3-asset-storage';
import {
  assetReferenceColumns,
  AssetReferencesDao,
} from '../../src/modules/assets/asset-references.dao';
import type { AssetStoragePort } from '../../src/modules/assets/asset-storage.port';
import type { AssetSweepService } from '../../src/modules/assets/asset-sweep.service';
import { assets } from '../../src/modules/assets/assets.po';
import { scenes } from '../../src/modules/scenes/scenes.po';
import { ClockFake } from '../support/auth-fakes';
import { FlakyRemovalStorageFake, RemovalLogFake } from '../support/asset-quota-fakes';
import { newAssetPo } from '../support/assets-factories';
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
): Promise<string> {
  const id = randomUUID();
  const storageKey = `assets/${id}`;
  await storage.put(storageKey, PNG_BYTES, 'image/png');
  const createdAt = new Date(Date.now() - hoursAgo * HOUR);
  await live.connection.db
    .insert(assets)
    .values(newAssetPo({ id, campaignId: table.id, storageKey, sizeBytes: 700, createdAt }));
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

function sweepWith(
  storage: Pick<AssetStoragePort, 'remove'>,
  log = new RemovalLogFake(),
): AssetSweepService {
  const clock = new ClockFake(new Date());
  return assetSweepOver({ db: live.connection.db, storage, clock, log });
}

describe('the sweep of loose files', () => {
  it('a file nothing uses for 25 h loses its row and its object, and the usage drops', async () => {
    const storage = bucket();
    const loose = await looseFile(storage, live.vharn, 25);
    expect(await storageOf(live.ana)).toBe(0);

    expect(await sweepWith(storage).sweep()).toEqual({ deleted: 1, removed: 1 });

    expect(await rowExists(loose)).toBe(false);
    expect(await storage.open(`assets/${loose}`)).toBeNull();
    storage.destroy();
  });

  it('a loose file of 23 h stays, as it still counts against the storage', async () => {
    const storage = bucket();
    const fresh = await looseFile(storage, live.vharn, 23);

    expect(await sweepWith(storage).sweep()).toEqual({ deleted: 0, removed: 0 });

    expect(await rowExists(fresh)).toBe(true);
    expect(await storageOf(live.ana)).toBe(700);
    storage.destroy();
  });

  it('an old file still used as the background of a grid is not deleted', async () => {
    const storage = bucket();
    const background = await looseFile(storage, live.vharn, 25);
    await live.connection.db
      .update(scenes)
      .set({ backgroundAssetId: background })
      .where(eq(scenes.campaignId, live.vharn.id));

    await sweepWith(storage).sweep();

    expect(await rowExists(background)).toBe(true);
    expect(await storageOf(live.ana)).toBe(700);
    storage.destroy();
  });

  it('a failed removal keeps the row deleted and goes to the log (the object is orphaned)', async () => {
    const storage = bucket();
    const loose = await looseFile(storage, live.quelm, 25);
    const flaky = new FlakyRemovalStorageFake(new Set([`assets/${loose}`]));
    const log = new RemovalLogFake();

    expect(await sweepWith(flaky, log).sweep()).toEqual({ deleted: 1, removed: 0 });

    expect(await rowExists(loose)).toBe(false);
    expect(log.warnings).toHaveLength(1);
    storage.destroy();
  });

  it('while another sweep holds the lock this one deletes nothing', async () => {
    const storage = bucket();
    const loose = await looseFile(storage, live.vharn, 25);

    const outcome = await runInTransaction(live.connection.db, async (tx) => {
      expect(await new AssetReferencesDao(tx).claimSweep()).toBe(true);
      return sweepWith(storage).sweep();
    });

    expect(outcome).toEqual({ deleted: 0, removed: 0 });
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
  it("removes the objects of all its files after the commit, and leaves the other table's", async () => {
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
    expect(await storage.open(`assets/${vharnFile.id}`)).toBeNull();
    const kept = await storage.open(`assets/${quelmFile.id}`);
    expect(kept).not.toBeNull();
    kept?.body.destroy();
    storage.destroy();
  });
});
