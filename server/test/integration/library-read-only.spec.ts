import {
  campaignLibraryDto,
  libraryMapDetailDto,
  libraryMapSummaryDto,
  sheetTemplateResponseDto,
  type UserPlan,
} from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { AssetsDao } from '../../src/modules/assets/assets.dao';
import { setAccountPlan } from '../support/account-plans';
import { newAssetPo } from '../support/assets-factories';
import { KINGDOM_GEOMETRY } from '../support/library-maps-factories';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();
const CODE = { files: [{ path: 'index.html', content: '<p></p>' }] };

function anaOn(plan: UserPlan): Promise<void> {
  return setAccountPlan(live.connection.db, live.ana.id, plan);
}

const vharnUrl = (path: string): string => `/api/campaigns/${live.vharn.id}/${path}`;

function call(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, payload?: object) {
  return live.http(live.ana, { method, url: vharnUrl(path), ...(payload && { payload }) });
}

const readOnly = (resource: string, limit: number) => ({
  code: 'PLAN_LIMIT',
  planLimit: { resource, limit, plan: 'free', reason: 'readOnly' },
});

async function library() {
  return campaignLibraryDto.parse((await call('GET', 'library')).json());
}

async function newMap(name: string): Promise<string> {
  const asset = newAssetPo({ campaignId: live.vharn.id, purpose: 'library_map' });
  const { id: assetId } = await new AssetsDao(live.connection.db).insert(asset);
  const response = await call('POST', 'library-maps', { name, assetId });
  if (response.statusCode !== 201) throw new Error(`create of ${name} answered ${response.body}`);
  return libraryMapSummaryDto.parse(response.json()).id;
}

async function newTemplate(name: string): Promise<string> {
  const response = await call('POST', 'sheet-templates', { ...CODE, name });
  if (response.statusCode !== 201) throw new Error(`create of ${name} answered ${response.body}`);
  return sheetTemplateResponseDto.parse(response.json()).template.id;
}

const REGION = { name: 'Reino', geometry: KINGDOM_GEOMETRY, color: '#aa3300' };

describe('a narrador table fallen to free (no map allowed): every map is read only', () => {
  let maps: string[] = [];
  beforeEach(async () => {
    await anaOn('narrador');
    maps = [await newMap('Mundo'), await newMap('Cidade')];
    await anaOn('free');
  });

  it('PATCH of the oldest map is 403 PLAN_LIMIT readOnly, limit 0', async () => {
    const response = await call('PATCH', `library-maps/${maps[0]}`, { name: 'Novo mundo' });

    expect(response.statusCode, response.body).toBe(403);
    expect(response.json()).toMatchObject(readOnly('libraryMaps', 0));
  });

  it('a new region on the oldest map is 403 PLAN_LIMIT readOnly', async () => {
    const response = await call('POST', `library-maps/${maps[0]}/regions`, REGION);

    expect(response.statusCode, response.body).toBe(403);
    expect(response.json()).toMatchObject(readOnly('libraryMaps', 0));
  });

  it('the library lists both maps with planLocked', async () => {
    expect((await library()).maps.map(({ planLocked }) => planLocked)).toEqual([true, true]);
  });

  it('marking and unmarking the main map pass, and deleting a map is 204', async () => {
    const marked = await call('PUT', `library-maps/${maps[0]}/main`);
    const unmarked = await call('DELETE', `library-maps/${maps[0]}/main`);
    const deleted = await call('DELETE', `library-maps/${maps[1]}`);

    expect(marked.statusCode, marked.body).toBe(200);
    expect(libraryMapSummaryDto.parse(marked.json()).planLocked).toBe(true);
    expect(unmarked.statusCode, unmarked.body).toBe(200);
    expect(deleted.statusCode, deleted.body).toBe(204);
  });

  it('the map detail carries planLocked too', async () => {
    const response = await call('GET', `library-maps/${maps[1]}`);

    expect(libraryMapDetailDto.parse(response.json()).planLocked).toBe(true);
  });
});

describe('a narrador table with 2 templates fallen to free: the 2nd template is read only', () => {
  let templates: string[] = [];
  beforeEach(async () => {
    await anaOn('narrador');
    templates = [await newTemplate('Tormenta'), await newTemplate('Ordem')];
    await anaOn('free');
  });

  it('PATCH of the 1st is 200 and of the 2nd is 403 PLAN_LIMIT readOnly', async () => {
    const payload = { expectedVersion: 0, name: 'Renomeada' };

    const first = await call('PATCH', `sheet-templates/${templates[0]}`, payload);
    const second = await call('PATCH', `sheet-templates/${templates[1]}`, payload);

    expect(first.statusCode, first.body).toBe(200);
    expect(second.statusCode, second.body).toBe(403);
    expect(second.json()).toMatchObject(readOnly('sheetTemplates', 1));
  });

  it('the library lists planLocked only on the 2nd template', async () => {
    const flags = (await library()).sheetTemplates?.map(({ planLocked }) => planLocked);

    expect(flags).toEqual([false, true]);
  });

  it('a sheet made from the locked template is 201', async () => {
    const payload = { actionId: crypto.randomUUID(), templateId: templates[1], name: 'Orc' };

    const response = await call('POST', 'sheets', payload);

    expect(response.statusCode, response.body).toBe(201);
  });

  it('deleting the locked template is 204', async () => {
    const response = await call('DELETE', `sheet-templates/${templates[1]}`);

    expect(response.statusCode, response.body).toBe(204);
  });
});
