import {
  characterChangedEventDto,
  sheetTemplateResponseDto,
  sheetWriteResponseDto,
  tokenSheetsResponseDto,
  type CharacterChangedEventDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { linkToCharacter } from '../support/characters';
import { gridAck, newGrid, setGridVisibility } from '../support/grids';
import { envelope, eventPayload, send, silence } from '../support/live-table';
import { recordEventsOf, type EventRecorder } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { characterOfUser, giveBars, LYRA_BARS } from '../support/table-characters';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();
const CODE = { html: '<p></p>', css: '', js: '' };

async function templateOf(table: Table = live.vharn): Promise<string> {
  const master = table.id === live.vharn.id ? live.ana : live.caio;
  const url = `/api/campaigns/${table.id}/sheet-templates`;
  const response = await live.http(master, { method: 'POST', url, payload: CODE });
  return sheetTemplateResponseDto.parse(response.json()).template.id;
}

async function give(holder: object, extra: object = {}): Promise<string> {
  const templateId = await templateOf();
  const payload = { actionId: crypto.randomUUID(), templateId, name: 'Ficha', holder, ...extra };
  const url = `/api/campaigns/${live.vharn.id}/sheets`;
  const response = await live.http(live.ana, { method: 'POST', url, payload });
  if (response.statusCode !== 201) throw new Error(`create answered ${response.body}`);
  return sheetWriteResponseDto.parse(response.json()).sheet.id;
}

function sheetsOfCharacter(user: SignedInUser, characterId: string, table: Table = live.vharn) {
  const url = `/api/campaigns/${table.id}/characters/${characterId}/sheets`;
  return live.http(user, { method: 'GET', url });
}

async function idsOf(answer: Awaited<ReturnType<typeof sheetsOfCharacter>>): Promise<string[]> {
  if (answer.statusCode !== 200) throw new Error(`list answered ${answer.body}`);
  return tokenSheetsResponseDto.parse(answer.json()).sheets.map(({ id }) => id);
}

async function tokenSheetIds(user: SignedInUser, tokenId: string): Promise<string[]> {
  const url = `/api/campaigns/${live.vharn.id}/tokens/${tokenId}/sheets`;
  return idsOf(await live.http(user, { method: 'GET', url }));
}

async function changedOf(recorder: EventRecorder): Promise<CharacterChangedEventDto> {
  return characterChangedEventDto.parse(await eventPayload(recorder, 'character:changed'));
}

async function mainSheetIdOf(user: SignedInUser): Promise<string | null> {
  return (await characterOfUser(live, live.vharn, user)).character.mainSheetId;
}

function setMain(characterId: string, sheetId: string): object {
  return { ...envelope(live.vharn.id), characterId, sheetId };
}

// Bia's Lyra on the Salão (the group grid) and on the public Estrada, both wearing her character.
async function lyraOnTwoGrids() {
  const ana = await live.atTable(live.ana, live.vharn);
  const bia = await live.atTable(live.bia, live.vharn);
  const lyraId = (await characterOfUser(live, live.vharn, live.bia)).character.id;
  const salao = recordEventsOf(ana);
  await send(ana, 'token:create', tokenCommandFor(live.vharn, live.bia.id));
  const onSalao = (await createdTokenOf(salao)).id;
  await linkToCharacter(ana, live.vharn, { tokenId: onSalao, characterId: lyraId });
  const estrada = await newGrid(live, live.ana, live.vharn, 'Estrada');
  await setGridVisibility(live, live.ana, live.vharn, estrada, 'public');
  for (const client of [ana, bia]) await gridAck(client, 'scene:watch', live.vharn, estrada);
  const created = recordEventsOf(ana);
  const command = { ...tokenCommandFor(live.vharn, live.bia.id), sceneId: estrada, bars: [] };
  await send(ana, 'token:create', command);
  const onEstrada = (await createdTokenOf(created)).id;
  const link = { sceneId: estrada, tokenId: onEstrada, characterId: lyraId };
  await linkToCharacter(ana, live.vharn, link);
  return { ana, bia, lyraId, onSalao, onEstrada };
}

describe('sheets of a character', () => {
  it("giving Caio his first sheet: the table hears library:changed and character:changed with Kael's main sheet", async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const caio = await live.atTable(live.caio, live.vharn);
    const [anaEvents, caioEvents] = [recordEventsOf(ana), recordEventsOf(caio)];

    const sheetId = await give({ memberId: live.caio.id });

    await eventPayload(caioEvents, 'library:changed');
    const heard = await changedOf(caioEvents);
    expect(heard.characters).toEqual([
      expect.objectContaining({ userId: live.caio.id, mainSheetId: sheetId }),
    ]);
    expect((await changedOf(anaEvents)).version).toBe(heard.version);
    expect(await mainSheetIdOf(live.caio)).toBe(sheetId);
  });

  it('a second sheet keeps the first as the main one and no character:changed goes out', async () => {
    const caio = await live.atTable(live.caio, live.vharn);
    const first = await give({ memberId: live.caio.id });
    await silence();
    const caioEvents = recordEventsOf(caio);

    await give({ memberId: live.caio.id }, { name: 'Grimório' });

    await eventPayload(caioEvents, 'library:changed');
    await silence();
    expect(caioEvents.events.map(({ name }) => name)).not.toContain('character:changed');
    expect(await mainSheetIdOf(live.caio)).toBe(first);
  });

  it('the Lyra of either grid opens the sheets of her character, by the token and by the character', async () => {
    const { lyraId, onSalao, onEstrada } = await lyraOnTwoGrids();
    const first = await give({ tokenId: onSalao });
    const second = await give({ tokenId: onEstrada }, { name: 'Diário', visibility: 'table' });

    expect(await tokenSheetIds(live.bia, onSalao)).toEqual([first, second]);
    expect(await tokenSheetIds(live.bia, onEstrada)).toEqual([first, second]);
    expect(await idsOf(await sheetsOfCharacter(live.bia, lyraId))).toEqual([first, second]);
    expect(await idsOf(await sheetsOfCharacter(live.caio, lyraId))).toEqual([second]);
    expect(await mainSheetIdOf(live.bia)).toBe(first);
  });

  it('Bia makes her second sheet the main one: the ack carries the version Caio hears', async () => {
    const bia = await live.atTable(live.bia, live.vharn);
    const caio = await live.atTable(live.caio, live.vharn);
    const lyraId = (await characterOfUser(live, live.vharn, live.bia)).character.id;
    await give({ memberId: live.bia.id });
    const grimorio = await give({ memberId: live.bia.id }, { name: 'Grimório' });
    await silence();
    const caioEvents = recordEventsOf(caio);

    const ack = await send(bia, 'character:setMainSheet', setMain(lyraId, grimorio));

    const heard = await changedOf(caioEvents);
    expect(ack).toEqual({ ok: true, version: heard.version });
    expect(heard.characters[0]).toMatchObject({ id: lyraId, mainSheetId: grimorio });
    expect(await mainSheetIdOf(live.bia)).toBe(grimorio);
  });

  it("Caio on Bia's character is FORBIDDEN; a sheet of Kael is SHEET_NOT_FOUND; nothing changes", async () => {
    const bia = await live.atTable(live.bia, live.vharn);
    const caio = await live.atTable(live.caio, live.vharn);
    const lyraId = (await characterOfUser(live, live.vharn, live.bia)).character.id;
    const lyraSheet = await give({ memberId: live.bia.id });
    const kaelSheet = await give({ memberId: live.caio.id });

    const forbidden = await send(caio, 'character:setMainSheet', setMain(lyraId, lyraSheet));
    const foreign = await send(bia, 'character:setMainSheet', setMain(lyraId, kaelSheet));

    expect(forbidden).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(foreign).toMatchObject({ ok: false, error: { code: 'SHEET_NOT_FOUND' } });
    expect(await mainSheetIdOf(live.bia)).toBe(lyraSheet);
  });

  it('deleting the main sheet leaves Lyra with none and the table hears it', async () => {
    const caio = await live.atTable(live.caio, live.vharn);
    const sheetId = await give({ memberId: live.bia.id }, { visibility: 'table' });
    await silence();
    const caioEvents = recordEventsOf(caio);

    const url = `/api/campaigns/${live.vharn.id}/sheets/${sheetId}`;
    const payload = { actionId: crypto.randomUUID() };
    const gone = await live.http(live.ana, { method: 'DELETE', url, payload });

    expect(gone.statusCode).toBe(204);
    expect((await changedOf(caioEvents)).characters[0]).toMatchObject({ mainSheetId: null });
    expect(await mainSheetIdOf(live.bia)).toBeNull();
  });

  it("sheet:adjustBar on Lyra's sheet changes her character's PV: Caio hears character:changed", async () => {
    const bia = await live.atTable(live.bia, live.vharn);
    const caio = await live.atTable(live.caio, live.vharn);
    const lyraId = (await characterOfUser(live, live.vharn, live.bia)).character.id;
    await giveBars(live, lyraId, LYRA_BARS);
    const pvId = (await characterOfUser(live, live.vharn, live.bia)).bars[0]?.id ?? '';
    const sheetId = await give({ memberId: live.bia.id });
    await silence();
    const caioEvents = recordEventsOf(caio);

    const change = { op: 'add', amount: -7 };
    const command = { ...envelope(live.vharn.id), sheetId, barId: pvId, change };
    const ack = await send(bia, 'sheet:adjustBar', command);

    const heard = await changedOf(caioEvents);
    expect(ack).toEqual({ ok: true, version: heard.version });
    expect((await characterOfUser(live, live.vharn, live.bia)).bars[0]?.current).toBe(25);
  });

  it('Quelm stays apart: its character is 404 at Vharn, and its room hears nothing of Vharn', async () => {
    const quelm = await live.atTable(live.caio, live.quelm);
    const quelmEvents = recordEventsOf(quelm);
    const sombra = await live.signUp('Sombra');
    const kaelId = (await characterOfUser(live, live.vharn, live.caio)).character.id;

    await give({ memberId: live.caio.id });
    const malformed = await sheetsOfCharacter(live.ana, 'not-an-id');
    const kaelAtQuelm = await sheetsOfCharacter(live.caio, kaelId, live.quelm);

    expect([malformed.statusCode, malformed.json().code]).toEqual([404, 'CHARACTER_NOT_FOUND']);
    expect([kaelAtQuelm.statusCode, kaelAtQuelm.json().code]).toEqual([404, 'CHARACTER_NOT_FOUND']);
    expect((await sheetsOfCharacter(sombra, kaelId)).statusCode).toBe(404);
    await silence();
    const heard = quelmEvents.events.map(({ name }) => name);
    expect(
      heard.filter((name) => name === 'character:changed' || name === 'library:changed'),
    ).toEqual([]);
  });
});
