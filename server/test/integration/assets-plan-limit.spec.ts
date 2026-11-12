import { randomUUID } from 'node:crypto';
import { PLAN_LIMITS, accountPlanDto, apiErrorDto, assetResponseDto } from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { assets } from '../../src/modules/assets/assets.po';
import { campaigns } from '../../src/modules/campaigns/campaigns.po';
import { sheetTemplates } from '../../src/modules/sheets/sheet-templates.po';
import { setAccountPlan } from '../support/account-plans';
import { newAssetPo } from '../support/assets-factories';
import { pngOf } from '../support/images';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { useTokenTable } from '../support/token-table';

// Ana owns Vharn (Bia and Caio play there); Caio owns Quelm.
const live = useTokenTable();
const FREE_STORAGE = PLAN_LIMITS.free.maxStorageBytes ?? 0;
const HOUR = 60 * 60 * 1000;
const GIB = 1024 * 1024 * 1024;

async function upload(user: SignedInUser, table: Table, purpose: string, png: Buffer) {
  return live.http(user, {
    method: 'POST',
    url: `/api/campaigns/${table.id}/assets?purpose=${purpose}`,
    headers: { 'content-type': 'image/png' },
    payload: png,
  });
}

async function keptWidth(user: SignedInUser, table: Table, purpose: string, width: number) {
  const response = await upload(user, table, purpose, await pngOf(width, 400));
  expect(response.statusCode, response.body).toBe(201);
  return assetResponseDto.parse(response.json()).asset.width;
}

async function storedFile(table: Table, sizeBytes: number, hoursAgo = 0): Promise<string> {
  const id = randomUUID();
  const createdAt = new Date(Date.now() - hoursAgo * HOUR);
  const row = newAssetPo({ id, campaignId: table.id, sizeBytes, createdAt });
  await live.connection.db.insert(assets).values({ ...row, storageKey: `assets/${id}` });
  return id;
}

async function storageOf(user: SignedInUser): Promise<number> {
  const response = await live.http(user, { method: 'GET', url: '/api/account/plan' });
  return accountPlanDto.parse(response.json()).usage.storageBytes;
}

async function assetCountOf(table: Table): Promise<number> {
  const rows = await live.connection.db
    .select()
    .from(assets)
    .where(eq(assets.campaignId, table.id));
  return rows.length;
}

describe('the side kept by the plan of the table owner', () => {
  it('on a free table a map of 8000 px keeps 4096 px and a background of 4000 px keeps 2048 px', async () => {
    expect(await keptWidth(live.ana, live.vharn, 'library_map', 8000)).toBe(4096);
    expect(await keptWidth(live.ana, live.vharn, 'background', 4000)).toBe(2048);
  });

  it('on a narrador table the same map keeps its 8000 px', async () => {
    await setAccountPlan(live.connection.db, live.ana.id, 'narrador');

    expect(await keptWidth(live.ana, live.vharn, 'library_map', 8000)).toBe(8000);
  });

  it("a player's background follows the owner's plan, not their own", async () => {
    await setAccountPlan(live.connection.db, live.bia.id, 'narrador');

    expect(await keptWidth(live.bia, live.vharn, 'background', 4000)).toBe(2048);
  });
});

describe("the owner's storage", () => {
  it('a free owner without room is refused with 403 storage and no file is kept', async () => {
    await storedFile(live.vharn, FREE_STORAGE - 10);
    const before = await assetCountOf(live.vharn);

    const response = await upload(live.bia, live.vharn, 'token', await pngOf(64, 64));

    expect(response.statusCode).toBe(403);
    expect(apiErrorDto.parse(response.json()).planLimit).toEqual({
      resource: 'storage',
      limit: FREE_STORAGE,
      plan: 'free',
    });
    expect(await assetCountOf(live.vharn)).toBe(before);
  });

  it('an amigo_do_dono owner with 5 GB stored still sends', async () => {
    await setAccountPlan(live.connection.db, live.ana.id, 'amigo_do_dono');
    // `size_bytes` is an integer: 5 GB of files is more than one row.
    for (let file = 0; file < 5; file += 1) await storedFile(live.vharn, GIB);

    const response = await upload(live.ana, live.vharn, 'token', await pngOf(64, 64));

    expect(response.statusCode).toBe(201);
  });

  it('the usage counts files in use and loose ones under 24 h, never the older loose ones', async () => {
    const inUse = await storedFile(live.vharn, 1000, 48);
    await live.connection.db
      .update(campaigns)
      .set({ coverAssetId: inUse })
      .where(eq(campaigns.id, live.vharn.id));
    await storedFile(live.vharn, 200, 23);
    await storedFile(live.vharn, 30, 25);
    const declared = await storedFile(live.vharn, 4, 30);
    await live.connection.db.insert(sheetTemplates).values({
      campaignId: live.vharn.id,
      name: 'Ficha com fonte',
      files: [{ path: 'index.html', content: '<p></p>' }],
      manifest: { permissions: [], bars: [], assets: [{ path: 'f.woff2', assetId: declared }] },
    });

    expect(await storageOf(live.ana)).toBe(1204);
  });

  it("the files of Caio's table do not count for Bia, nor those of a table she only plays in", async () => {
    await storedFile(live.vharn, 500);
    await storedFile(live.quelm, 70);

    expect(await storageOf(live.bia)).toBe(0);
    expect(await storageOf(live.caio)).toBe(70);
    expect(await storageOf(live.ana)).toBe(500);
  });

  it('a sent file shows in GET /account/plan with its kept bytes', async () => {
    const response = await upload(live.bia, live.vharn, 'token', await pngOf(64, 64));
    const asset = assetResponseDto.parse(response.json()).asset;
    const [row] = await live.connection.db.select().from(assets).where(eq(assets.id, asset.id));

    expect(await storageOf(live.ana)).toBe(row?.sizeBytes);
  });
});
