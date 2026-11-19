import {
  sheetTemplateResponseDto,
  sheetWriteResponseDto,
  type UserPlan,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { SheetsDao } from '../../src/modules/sheets/sheets.dao';
import { setAccountPlan } from '../support/account-plans';
import { send } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();
const CODE = { files: [{ path: 'index.html', content: '<p></p>' }] };

function planOf(user: SignedInUser, plan: UserPlan): Promise<void> {
  return setAccountPlan(live.connection.db, user.id, plan);
}

const INDEX = { path: 'index.html', content: '<p id="pv"></p>' };
const SCRIPT = { path: 'scripts/a.js', content: 'lorkarium.ready();' };
const SCRIPTED = { files: [INDEX, SCRIPT] };

function postTemplate(
  user: SignedInUser = live.ana,
  table: Table = live.vharn,
  payload: object = CODE,
) {
  const url = `/api/campaigns/${table.id}/sheet-templates`;
  return live.http(user, { method: 'POST', url, payload });
}

function patchFiles(templateId: string, files: readonly object[]) {
  const url = `/api/campaigns/${live.vharn.id}/sheet-templates/${templateId}`;
  return live.http(live.ana, { method: 'PATCH', url, payload: { expectedVersion: 0, files } });
}

async function templateOf(
  user: SignedInUser = live.ana,
  table: Table = live.vharn,
  payload: object = CODE,
) {
  const response = await postTemplate(user, table, payload);
  if (response.statusCode !== 201) throw new Error(`create template answered ${response.body}`);
  return sheetTemplateResponseDto.parse(response.json()).template.id;
}

// A loose token of `table`, created by its master.
async function looseToken(user: SignedInUser, table: Table): Promise<string> {
  const socket = await live.atTable(user, table);
  const events = recordEventsOf(socket);
  await send(socket, 'token:create', tokenCommandFor(table, user.id, { name: 'Goblin', bars: [] }));
  return (await createdTokenOf(events)).id;
}

// `count` sheets held by `tokenId`, straight in the database.
async function npcSheets(table: Table, templateId: string, tokenId: string, count: number) {
  const dao = new SheetsDao(live.connection.db);
  for (let index = 0; index < count; index += 1)
    await dao.insert({ campaignId: table.id, templateId, name: `NPC ${index}`, tokenId });
}

function createSheet(templateId: string, holder?: object) {
  const payload = { actionId: crypto.randomUUID(), templateId, name: 'Orc', holder };
  return live.http(live.ana, {
    method: 'POST',
    url: `/api/campaigns/${live.vharn.id}/sheets`,
    payload,
  });
}

function give(sheetId: string, holder: object | null) {
  const url = `/api/campaigns/${live.vharn.id}/sheets/${sheetId}`;
  return live.http(live.ana, {
    method: 'PATCH',
    url,
    payload: { actionId: crypto.randomUUID(), holder },
  });
}

const npcLimit = {
  code: 'PLAN_LIMIT',
  planLimit: { resource: 'npcSheets', limit: 5, plan: 'free' },
};

describe("sheet templates and NPC sheets follow the owner's plan", () => {
  it('a free table with 1 template refuses the 2nd (an imported .lksheet too) with 403 PLAN_LIMIT', async () => {
    await planOf(live.ana, 'free');
    await templateOf();

    const response = await postTemplate();

    expect(response.statusCode, response.body).toBe(403);
    expect(response.json()).toMatchObject({
      code: 'PLAN_LIMIT',
      planLimit: { resource: 'sheetTemplates', limit: 1, plan: 'free' },
    });
  });

  it('a narrador table creates its 2nd template', async () => {
    await planOf(live.ana, 'narrador');
    await templateOf();

    expect((await postTemplate()).statusCode).toBe(201);
  });

  // The JS is kept on every plan; only the client leaves it out where the plan has no sheetScripts.
  it('a free table creates a template with scripts/a.js (an imported .lksheet too)', async () => {
    await planOf(live.ana, 'free');

    const response = await postTemplate(live.ana, live.vharn, SCRIPTED);

    expect(response.statusCode, response.body).toBe(201);
  });

  it('a free table changes the a.js of its template', async () => {
    await planOf(live.ana, 'free');
    const templateId = await templateOf(live.ana, live.vharn, SCRIPTED);

    const changed = await patchFiles(templateId, [INDEX, { ...SCRIPT, content: 'go();' }]);

    expect(changed.statusCode, changed.body).toBe(200);
  });

  it('a free table with 5 token sheets refuses the 6th with 403 PLAN_LIMIT npcSheets', async () => {
    await planOf(live.ana, 'free');
    const templateId = await templateOf();
    const goblin = await looseToken(live.ana, live.vharn);
    await npcSheets(live.vharn, templateId, goblin, 5);

    const response = await createSheet(templateId, { tokenId: goblin });

    expect(response.statusCode, response.body).toBe(403);
    expect(response.json()).toMatchObject(npcLimit);
  });

  it("giving a sheet to a token as the 6th is PLAN_LIMIT; a player's sheet and one nobody holds still pass", async () => {
    await planOf(live.ana, 'free');
    const templateId = await templateOf();
    const goblin = await looseToken(live.ana, live.vharn);
    await npcSheets(live.vharn, templateId, goblin, 5);

    const bias = await createSheet(templateId, { memberId: live.bia.id });
    const nobodys = await createSheet(templateId);
    const sheetId = sheetWriteResponseDto.parse(bias.json()).sheet.id;
    const given = await give(sheetId, { tokenId: goblin });

    expect([bias.statusCode, nobodys.statusCode]).toEqual([201, 201]);
    expect(given.statusCode, given.body).toBe(403);
    expect(given.json()).toMatchObject(npcLimit);
  });

  it("Quelm's token sheets do not count at Vharn", async () => {
    await planOf(live.ana, 'free');
    await planOf(live.caio, 'narrador');
    const quelmTemplate = await templateOf(live.caio, live.quelm);
    const covil = await looseToken(live.caio, live.quelm);
    await npcSheets(live.quelm, quelmTemplate, covil, 10);
    const templateId = await templateOf();
    const goblin = await looseToken(live.ana, live.vharn);

    expect((await createSheet(templateId, { tokenId: goblin })).statusCode).toBe(201);
  });

  it('an amigo_do_dono table gives the 6th sheet to a token', async () => {
    await planOf(live.ana, 'amigo_do_dono');
    const templateId = await templateOf();
    const goblin = await looseToken(live.ana, live.vharn);
    await npcSheets(live.vharn, templateId, goblin, 5);

    expect((await createSheet(templateId, { tokenId: goblin })).statusCode).toBe(201);
  });
});
