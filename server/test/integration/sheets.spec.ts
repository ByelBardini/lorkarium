import {
  sheetChangedEventDto,
  sheetResponseDto,
  sheetTemplateResponseDto,
  sheetWriteResponseDto,
  tokenSheetsResponseDto,
  type SheetWriteResponseDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { linkToPlayerCharacter, lyraPoisonedAtVharn, tokenIn } from '../support/characters';
import { gridAck, newGrid, setGridVisibility } from '../support/grids';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import { characterOfUser } from '../support/table-characters';
import type { Table } from '../support/tables';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();
const CODE = { html: '<p id="pv"></p>', css: '', js: '' };

function sheetsUrl(table: Table = live.vharn): string {
  return `/api/campaigns/${table.id}/sheets`;
}

async function templateOf(user: SignedInUser = live.ana, table: Table = live.vharn) {
  const url = `/api/campaigns/${table.id}/sheet-templates`;
  const payload = { name: 'Ficha Tormenta', ...CODE };
  const response = await live.http(user, { method: 'POST', url, payload });
  return sheetTemplateResponseDto.parse(response.json()).template.id;
}

function link(tokenId: string, templateId: string, extra: object = {}) {
  const holder = { tokenId };
  const payload = { actionId: crypto.randomUUID(), templateId, name: 'Lyra', holder, ...extra };
  return live.http(live.ana, { method: 'POST', url: sheetsUrl(), payload });
}

async function linked(tokenId: string, extra: object = {}): Promise<SheetWriteResponseDto> {
  const response = await link(tokenId, await templateOf(), extra);
  if (response.statusCode !== 201) throw new Error(`link answered ${response.body}`);
  return sheetWriteResponseDto.parse(response.json());
}

function writeValues(user: SignedInUser, sheetId: string, changes: object, actionId?: string) {
  const payload = { actionId: actionId ?? crypto.randomUUID(), changes };
  const url = `${sheetsUrl()}/${sheetId}/values`;
  return live.http(user, { method: 'PATCH', url, payload });
}

function readOfToken(user: SignedInUser, tokenId: string) {
  const url = `/api/campaigns/${live.vharn.id}/tokens/${tokenId}/sheets`;
  return live.http(user, { method: 'GET', url });
}

async function sheetIdsOf(user: SignedInUser, tokenId: string): Promise<string[]> {
  const response = await readOfToken(user, tokenId);
  if (response.statusCode !== 200) throw new Error(`list answered ${response.body}`);
  return tokenSheetsResponseDto.parse(response.json()).sheets.map(({ id }) => id);
}

async function sheetIdsOfCharacter(user: SignedInUser, characterId: string): Promise<string[]> {
  const url = `/api/campaigns/${live.vharn.id}/characters/${characterId}/sheets`;
  const response = await live.http(user, { method: 'GET', url });
  if (response.statusCode !== 200) throw new Error(`list answered ${response.body}`);
  return tokenSheetsResponseDto.parse(response.json()).sheets.map(({ id }) => id);
}

function readSheet(user: SignedInUser, sheetId: string) {
  return live.http(user, { method: 'GET', url: `${sheetsUrl()}/${sheetId}` });
}

// Lyra of Bia linked to her card on the Salão and, on the public Estrada, a second Lyra linked
// to the same card.
async function lyraOnTwoGrids() {
  const table = await lyraPoisonedAtVharn(live);
  const { ana, lyra } = table;
  await linkToPlayerCharacter(live, ana, live.vharn, { tokenId: lyra.id, memberId: live.bia.id });
  const estrada = await newGrid(live, live.ana, live.vharn, 'Estrada');
  await setGridVisibility(live, live.ana, live.vharn, estrada, 'public');
  await gridAck(ana, 'scene:watch', live.vharn, estrada);
  const anaEvents = recordEventsOf(ana);
  const command = { ...tokenCommandFor(live.vharn, live.bia.id), sceneId: estrada, bars: [] };
  await send(ana, 'token:create', command);
  const lyraOfEstrada = (await createdTokenOf(anaEvents)).id;
  await linkToPlayerCharacter(live, ana, live.vharn, {
    sceneId: estrada,
    tokenId: lyraOfEstrada,
    memberId: live.bia.id,
  });
  return { ...table, estrada, lyraOfEstrada };
}

describe('sheets linked to tokens over HTTP', () => {
  it("Ana links Ficha Tormenta to Lyra: the sheet is Bia's character's and both Lyras open it", async () => {
    const { lyra, lyraOfEstrada } = await lyraOnTwoGrids();
    const { character } = await characterOfUser(live, live.vharn, live.bia);

    const { sheet } = await linked(lyra.id);

    expect(sheet).toMatchObject({ tokenId: null, memberId: live.bia.id });
    expect(await sheetIdsOf(live.bia, lyra.id)).toEqual([sheet.id]);
    expect(await sheetIdsOf(live.bia, lyraOfEstrada)).toEqual([sheet.id]);
    expect(await sheetIdsOfCharacter(live.bia, character.id)).toEqual([sheet.id]);
    const read = sheetResponseDto.parse((await readSheet(live.bia, sheet.id)).json());
    expect(read.template).toMatchObject({ name: 'Ficha Tormenta', html: CODE.html });
    expect(read.sheet).toMatchObject({ name: 'Lyra', memberId: live.bia.id, folderId: null });
  });

  it('Bia writes forca 16, the version goes up and Caio hears sheet:changed without values', async () => {
    const { lyra, caio } = await lyraPoisonedAtVharn(live);
    const { sheet } = await linked(lyra.id);
    await silence();
    const caioEvents = recordEventsOf(caio);

    const response = await writeValues(live.bia, sheet.id, { forca: 16 });

    expect(response.statusCode).toBe(200);
    const written = sheetWriteResponseDto.parse(response.json());
    expect(written.sheet).toMatchObject({ values: { forca: 16 }, version: 1, canEdit: true });
    const heard = await eventPayload(caioEvents, 'sheet:changed');
    expect(sheetChangedEventDto.parse(heard)).toMatchObject({ sheetId: sheet.id, version: 1 });
    expect(heard).not.toHaveProperty('values');
  });

  it('the values stay after the server restarts', async () => {
    const { lyra } = await lyraPoisonedAtVharn(live);
    const { sheet } = await linked(lyra.id);
    await writeValues(live.bia, sheet.id, { forca: 16 });

    await live.restart();

    const read = sheetResponseDto.parse((await readSheet(live.bia, sheet.id)).json());
    expect(read.sheet.values).toEqual({ forca: 16 });
  });

  it('a table sheet: Caio and the spectator Duda read it with canEdit false', async () => {
    const { lyra } = await lyraPoisonedAtVharn(live);
    const { sheet } = await linked(lyra.id, { visibility: 'table' });
    const duda = await live.signUp('Duda');
    await live.joinAsSpectator(duda, live.vharn);

    const caio = sheetResponseDto.parse((await readSheet(live.caio, sheet.id)).json());
    const spectator = sheetResponseDto.parse((await readSheet(duda, sheet.id)).json());

    expect([caio.sheet.canEdit, spectator.sheet.canEdit]).toEqual([false, false]);
  });

  it('notas null removes the key', async () => {
    const { lyra } = await lyraPoisonedAtVharn(live);
    const { sheet } = await linked(lyra.id);
    await writeValues(live.bia, sheet.id, { forca: 16, notas: 'emboscada' });

    const response = await writeValues(live.bia, sheet.id, { notas: null });

    expect(sheetWriteResponseDto.parse(response.json()).sheet.values).toEqual({ forca: 16 });
  });

  it('Bia and Ana writing different keys at the same time keep both', async () => {
    const { lyra } = await lyraPoisonedAtVharn(live);
    const { sheet } = await linked(lyra.id);

    await Promise.all([
      writeValues(live.bia, sheet.id, { forca: 16 }),
      writeValues(live.ana, sheet.id, { destreza: 12 }),
    ]);

    const read = sheetResponseDto.parse((await readSheet(live.bia, sheet.id)).json());
    expect(read.sheet.values).toEqual({ forca: 16, destreza: 12 });
    expect(read.sheet.version).toBe(2);
  });

  it('unlinking Lyra leaves the sheet on the character', async () => {
    const { ana, lyra } = await lyraPoisonedAtVharn(live);
    await linkToPlayerCharacter(live, ana, live.vharn, { tokenId: lyra.id, memberId: live.bia.id });
    const { sheet } = await linked(lyra.id);
    const { character } = await characterOfUser(live, live.vharn, live.bia);

    await send(ana, 'token:unlinkFromCharacter', { ...envelope(live.vharn.id), tokenId: lyra.id });

    expect(await sheetIdsOf(live.bia, lyra.id)).toEqual([]);
    expect(await sheetIdsOfCharacter(live.bia, character.id)).toEqual([sheet.id]);
  });

  it('a controllers sheet is 404 SHEET_NOT_FOUND to Caio by id, and missing from the token list', async () => {
    const { lyra } = await lyraPoisonedAtVharn(live);
    const { sheet } = await linked(lyra.id);

    const byId = await readSheet(live.caio, sheet.id);

    expect(byId.statusCode).toBe(404);
    expect(byId.json()).toMatchObject({ code: 'SHEET_NOT_FOUND' });
    expect(await sheetIdsOf(live.caio, lyra.id)).toEqual([]);
  });

  it('Caio writing on a table sheet is 403 and nothing changes', async () => {
    const { lyra } = await lyraPoisonedAtVharn(live);
    const { sheet } = await linked(lyra.id, { visibility: 'table' });

    const response = await writeValues(live.caio, sheet.id, { forca: 1 });

    expect(response.statusCode).toBe(403);
    const read = sheetResponseDto.parse((await readSheet(live.bia, sheet.id)).json());
    expect(read.sheet.version).toBe(0);
  });

  it('Bia changing the visibility or the template is 403', async () => {
    const { lyra } = await lyraPoisonedAtVharn(live);
    const { sheet } = await linked(lyra.id);
    const url = `${sheetsUrl()}/${sheet.id}`;

    const visibility = { actionId: crypto.randomUUID(), visibility: 'table' };
    const template = { actionId: crypto.randomUUID(), templateId: sheet.templateId };
    const answers = [
      await live.http(live.bia, { method: 'PATCH', url, payload: visibility }),
      await live.http(live.bia, { method: 'PATCH', url, payload: template }),
    ];

    expect(answers.map(({ statusCode }) => statusCode)).toEqual([403, 403]);
  });

  it('Ana puts the sheet in table, and then deletes it with 204', async () => {
    const { lyra } = await lyraPoisonedAtVharn(live);
    const { sheet } = await linked(lyra.id);
    const url = `${sheetsUrl()}/${sheet.id}`;

    const shown = await live.http(live.ana, {
      method: 'PATCH',
      url,
      payload: { actionId: crypto.randomUUID(), visibility: 'table' },
    });
    expect(sheetWriteResponseDto.parse(shown.json()).sheet).toMatchObject({ visibility: 'table' });

    const payload = { actionId: crypto.randomUUID() };
    expect((await live.http(live.ana, { method: 'DELETE', url, payload })).statusCode).toBe(204);
    expect((await readSheet(live.ana, sheet.id)).statusCode).toBe(404);
  });

  it('the Lyra of each grid takes another sheet: the character holds both, in creation order', async () => {
    const { lyra, lyraOfEstrada } = await lyraOnTwoGrids();
    const templateId = await templateOf();
    const first = sheetWriteResponseDto.parse((await link(lyra.id, templateId)).json()).sheet;

    const second = await link(lyraOfEstrada, templateId, { name: 'Grimório', visibility: 'table' });

    expect(second.statusCode).toBe(201);
    const grimorio = sheetWriteResponseDto.parse(second.json()).sheet;
    expect(grimorio.tokenId).toBe(first.tokenId);
    expect(await sheetIdsOf(live.bia, lyra.id)).toEqual([first.id, grimorio.id]);
    expect(await sheetIdsOf(live.caio, lyraOfEstrada)).toEqual([grimorio.id]);
  });

  it('the token of Quelm is 404 at Vharn', async () => {
    const caio = await live.atTable(live.caio, live.quelm);
    const caioEvents = recordEventsOf(caio);
    await send(caio, 'token:create', tokenCommandFor(live.quelm, live.caio.id));
    const quelmToken = (await createdTokenOf(caioEvents)).id;

    const response = await link(quelmToken, await templateOf());

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'TOKEN_NOT_FOUND' });
    const list = await readOfToken(live.ana, quelmToken);
    expect([list.statusCode, list.json().code]).toEqual([404, 'TOKEN_NOT_FOUND']);
  });

  it('Bia demoted to spectator is treated like Caio: her controllers sheet is gone for her', async () => {
    const { lyra } = await lyraPoisonedAtVharn(live);
    const { sheet } = await linked(lyra.id);
    const url = `/api/campaigns/${live.vharn.id}/members/${live.bia.id}`;
    await live.http(live.ana, { method: 'PATCH', url, payload: { role: 'spectator' } });

    expect((await readSheet(live.bia, sheet.id)).statusCode).toBe(404);
  });

  it('once Ana takes Bia out of the control of Lyra, her controllers sheet is 404 for her', async () => {
    const { ana, lyra } = await lyraPoisonedAtVharn(live);
    const { sheet } = await linked(lyra.id);
    const shown = tokenIn(await synced(ana, live.vharn), lyra.id);
    const bars = shown.bars.map(({ label, current, max, color, visibility, display }) => ({
      ...{ label, current, max, color, visibility, display },
    }));
    const { name, initials, side, width, height } = shown;
    const update = { ...envelope(live.vharn.id), tokenId: lyra.id, bars, controllerIds: [] };
    const ack = await send(ana, 'token:update', { ...update, name, initials, side, width, height });
    expect(ack).toMatchObject({ ok: true });

    const read = await readSheet(live.bia, sheet.id);

    expect(read.statusCode).toBe(404);
    expect(read.json()).toMatchObject({ code: 'SHEET_NOT_FOUND' });
  });

  it('an actionId used again with another write is 409 SHEET_ACTION_REUSED', async () => {
    const { lyra } = await lyraPoisonedAtVharn(live);
    const { sheet } = await linked(lyra.id);
    const actionId = crypto.randomUUID();
    await writeValues(live.bia, sheet.id, { forca: 16 }, actionId);

    const again = await writeValues(live.bia, sheet.id, { forca: 16 }, actionId);
    const reused = await writeValues(live.bia, sheet.id, { forca: 17 }, actionId);

    expect(sheetWriteResponseDto.parse(again.json()).sheet.version).toBe(1);
    expect(reused.statusCode).toBe(409);
    expect(reused.json()).toMatchObject({ code: 'SHEET_ACTION_REUSED' });
  });

  it('values over the budget after the merge are 400 and nothing is saved', async () => {
    const { lyra } = await lyraPoisonedAtVharn(live);
    const { sheet } = await linked(lyra.id);
    const big = 'a'.repeat(200 * 1024);
    await writeValues(live.bia, sheet.id, { historia: big });

    const response = await writeValues(live.bia, sheet.id, { biografia: big });

    expect(response.statusCode).toBe(400);
    const read = sheetResponseDto.parse((await readSheet(live.bia, sheet.id)).json());
    expect(Object.keys(read.sheet.values)).toEqual(['historia']);
  });

  it('deleting a template run by 2 sheets is 409 SHEET_TEMPLATE_IN_USE citing "2 sheets"', async () => {
    const { lyra, ana } = await lyraPoisonedAtVharn(live);
    const anaEvents = recordEventsOf(ana);
    await send(ana, 'token:create', tokenCommandFor(live.vharn, live.caio.id, { col: 6 }));
    const bram = (await createdTokenOf(anaEvents)).id;
    const templateId = await templateOf();
    await link(lyra.id, templateId);
    await link(bram, templateId);

    const url = `/api/campaigns/${live.vharn.id}/sheet-templates/${templateId}`;
    const response = await live.http(live.ana, { method: 'DELETE', url });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'SHEET_TEMPLATE_IN_USE',
      message: expect.stringContaining('2 sheets'),
    });
  });
});
