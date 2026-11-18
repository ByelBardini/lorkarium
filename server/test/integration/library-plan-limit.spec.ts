import type { UserPlan } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { AssetsDao } from '../../src/modules/assets/assets.dao';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { setAccountPlan } from '../support/account-plans';
import { newAssetPo } from '../support/assets-factories';
import type { Table } from '../support/tables';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();

const scenesUrl = (table: Table = live.vharn): string => `/api/campaigns/${table.id}/scenes`;

// Vharn is born with its group grid; this tops it up to `total` grids.
async function fillGrids(total: number, table: Table = live.vharn): Promise<string> {
  const scenes = new ScenesDao(live.connection.db);
  const existing = await scenes.listOfCampaign(table.id);
  for (let index = existing.length; index < total; index += 1)
    await scenes.insert({ campaignId: table.id, name: `Grid ${index + 1}`, folderId: null });
  const [first] = await scenes.listOfCampaign(table.id);
  if (!first) throw new Error(`table ${table.id} came without grids`);
  return first.id;
}

async function gridCount(table: Table = live.vharn): Promise<number> {
  return (await new ScenesDao(live.connection.db).listOfCampaign(table.id)).length;
}

function createGrid() {
  return live.http(live.ana, { method: 'POST', url: scenesUrl(), payload: {} });
}

function duplicate(sceneId: string) {
  return live.http(live.ana, { method: 'POST', url: `${scenesUrl()}/${sceneId}/copies` });
}

async function createMap() {
  const asset = newAssetPo({ campaignId: live.vharn.id, purpose: 'library_map' });
  const { id: assetId } = await new AssetsDao(live.connection.db).insert(asset);
  const url = `/api/campaigns/${live.vharn.id}/library-maps`;
  return live.http(live.ana, { method: 'POST', url, payload: { name: 'Mundo', assetId } });
}

function anaOn(plan: UserPlan): Promise<void> {
  return setAccountPlan(live.connection.db, live.ana.id, plan);
}

function planLimit(resource: string, limit: number, plan: UserPlan) {
  return { code: 'PLAN_LIMIT', planLimit: { resource, limit, plan } };
}

describe("grids, copies and maps follow the owner's plan", () => {
  it('a free table with 3 grids refuses the 4th with 403 PLAN_LIMIT scenes', async () => {
    await anaOn('free');
    await fillGrids(3);

    const response = await createGrid();

    expect(response.statusCode, response.body).toBe(403);
    expect(response.json()).toMatchObject(planLimit('scenes', 3, 'free'));
    expect(await gridCount()).toBe(3);
  });

  it('a free table duplicating its only grid is 403 PLAN_LIMIT sceneCopy', async () => {
    await anaOn('free');
    const sceneId = await fillGrids(1);

    const response = await duplicate(sceneId);

    expect(response.statusCode, response.body).toBe(403);
    expect(response.json()).toMatchObject(planLimit('sceneCopy', 0, 'free'));
    expect(await gridCount()).toBe(1);
  });

  it('a narrador table with 15 grids duplicating is 403 PLAN_LIMIT scenes', async () => {
    await anaOn('narrador');
    const sceneId = await fillGrids(15);

    const response = await duplicate(sceneId);

    expect(response.statusCode, response.body).toBe(403);
    expect(response.json()).toMatchObject(planLimit('scenes', 15, 'narrador'));
  });

  it('a free table refuses even its first map with 403 PLAN_LIMIT libraryMaps, limit 0', async () => {
    await anaOn('free');

    const response = await createMap();

    expect(response.statusCode, response.body).toBe(403);
    expect(response.json()).toMatchObject(planLimit('libraryMaps', 0, 'free'));
  });

  it('a narrador table with 3 maps refuses the 4th with 403 PLAN_LIMIT libraryMaps', async () => {
    await anaOn('narrador');
    for (let made = 0; made < 3; made += 1) expect((await createMap()).statusCode).toBe(201);

    const response = await createMap();

    expect(response.statusCode, response.body).toBe(403);
    expect(response.json()).toMatchObject(planLimit('libraryMaps', 3, 'narrador'));
  });

  it('an amigo_do_dono table with 40 grids creates the 41st and duplicates', async () => {
    await anaOn('amigo_do_dono');
    const sceneId = await fillGrids(40);

    expect((await createGrid()).statusCode).toBe(201);
    expect((await duplicate(sceneId)).statusCode).toBe(201);
    expect(await gridCount()).toBe(42);
  });

  it('the grids of Quelm do not count for Vharn', async () => {
    await anaOn('free');
    await fillGrids(2);
    await fillGrids(10, live.quelm);

    const response = await createGrid();

    expect(response.statusCode, response.body).toBe(201);
  });
});
