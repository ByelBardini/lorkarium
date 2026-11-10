import {
  sheetTemplateResponseDto,
  sheetWriteResponseDto,
  characterChangedEventDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  gridState,
  linkToPlayerCharacter,
  lyraPoisonedAtVharn,
  tokenIn,
} from '../support/characters';
import { gridAck, newGrid, setGridVisibility } from '../support/grids';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
import type { Table } from '../support/tables';
import { lyraBarsOnBia } from '../support/table-characters';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();
const CODE = { files: [{ path: 'index.html', content: '<p></p>' }] };

async function sheetOf(
  tokenId: string | null,
  visibility = 'controllers',
  table: Table = live.vharn,
) {
  const master = table.id === live.vharn.id ? live.ana : live.caio;
  const base = `/api/campaigns/${table.id}`;
  const template = await live.http(master, {
    method: 'POST',
    url: `${base}/sheet-templates`,
    payload: CODE,
  });
  const templateId = sheetTemplateResponseDto.parse(template.json()).template.id;
  const holder = tokenId ? { holder: { tokenId } } : {};
  const payload = {
    actionId: crypto.randomUUID(),
    templateId,
    name: 'Ficha',
    visibility,
    ...holder,
  };
  const response = await live.http(master, { method: 'POST', url: `${base}/sheets`, payload });
  return sheetWriteResponseDto.parse(response.json()).sheet.id;
}

function adjust(sheetId: string, barId: string, change: object = { op: 'add', amount: -7 }) {
  return { ...envelope(live.vharn.id), sheetId, barId, change };
}

// Lyra of Bia linked to her card on the Salão, and a second Lyra linked on the public Estrada.
async function lyraOnTwoGrids() {
  const table = await lyraPoisonedAtVharn(live);
  const { ana, bia, caio, lyra } = table;
  await linkToPlayerCharacter(live, ana, live.vharn, { tokenId: lyra.id, memberId: live.bia.id });
  await lyraBarsOnBia(live);
  const estrada = await newGrid(live, live.ana, live.vharn, 'Estrada');
  await setGridVisibility(live, live.ana, live.vharn, estrada, 'public');
  for (const client of [ana, bia, caio]) await gridAck(client, 'scene:watch', live.vharn, estrada);
  const anaEvents = recordEventsOf(ana);
  const command = { ...tokenCommandFor(live.vharn, live.bia.id), sceneId: estrada, bars: [] };
  await send(ana, 'token:create', command);
  const lyraOfEstrada = (await createdTokenOf(anaEvents)).id;
  const link = { sceneId: estrada, tokenId: lyraOfEstrada, memberId: live.bia.id };
  await linkToPlayerCharacter(live, ana, live.vharn, link);
  const pvId = tokenIn(await synced(bia, live.vharn), lyra.id).bars[0]?.id ?? '';
  return { ...table, estrada, lyraOfEstrada, pvId };
}

function pvOf(state: Awaited<ReturnType<typeof synced>>, tokenId: string): number | undefined {
  return tokenIn(state, tokenId).bars.find(({ label }) => label === 'PV')?.current;
}

describe('sheet:adjustBar', () => {
  it('Bia takes 7 PV through the sheet of Lyra: Caio hears her character and the Estrada shows 25', async () => {
    const { bia, caio, lyra, estrada, lyraOfEstrada, pvId } = await lyraOnTwoGrids();
    const sheetId = await sheetOf(lyra.id);
    await silence();
    const caioEvents = recordEventsOf(caio);

    const ack = await send(bia, 'sheet:adjustBar', adjust(sheetId, pvId));

    expect(ack).toMatchObject({ ok: true, version: expect.any(Number) });
    const heard = characterChangedEventDto.parse(
      await eventPayload(caioEvents, 'character:changed'),
    );
    expect(ack.ok && ack.version).toBe(heard.version);
    expect(pvOf(await gridState(bia, live.vharn, estrada), lyraOfEstrada)).toBe(25);
  });

  it('the sheet of an unlinked Lyra adjusts her on the group grid', async () => {
    const { bia, lyra } = await lyraPoisonedAtVharn(live);
    const pvId = tokenIn(await synced(bia, live.vharn), lyra.id).bars[0]?.id ?? '';
    const sheetId = await sheetOf(lyra.id);

    const ack = await send(bia, 'sheet:adjustBar', adjust(sheetId, pvId, { op: 'set', value: 3 }));

    expect(ack).toMatchObject({ ok: true });
    expect(pvOf(await synced(bia, live.vharn), lyra.id)).toBe(3);
  });

  it('Caio on a table sheet is FORBIDDEN and nobody hears a change', async () => {
    const { ana, caio, lyra, pvId } = await lyraOnTwoGrids();
    const sheetId = await sheetOf(lyra.id, 'table');
    await silence();
    const anaEvents = recordEventsOf(ana);

    const ack = await send(caio, 'sheet:adjustBar', adjust(sheetId, pvId));

    expect(ack).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    await silence();
    const heard = anaEvents.events.map(({ name }) => name);
    expect(
      heard.filter((name) => name === 'token:updated' || name === 'character:changed'),
    ).toEqual([]);
  });

  it('a bar of another token is BAR_NOT_FOUND', async () => {
    const { ana, bia, lyra } = await lyraPoisonedAtVharn(live);
    const anaEvents = recordEventsOf(ana);
    await send(ana, 'token:create', tokenCommandFor(live.vharn, live.caio.id, { col: 6 }));
    const bram = await createdTokenOf(anaEvents);
    const sheetId = await sheetOf(lyra.id);

    const ack = await send(bia, 'sheet:adjustBar', adjust(sheetId, bram.bars[0]?.id ?? ''));

    expect(ack).toMatchObject({ ok: false, error: { code: 'BAR_NOT_FOUND' } });
  });

  it('the sheet of Quelm is SHEET_NOT_FOUND at Vharn', async () => {
    const { ana, pvId } = await lyraOnTwoGrids();
    const caio = await live.atTable(live.caio, live.quelm);
    const quelmEvents = recordEventsOf(caio);
    await send(caio, 'token:create', tokenCommandFor(live.quelm, live.caio.id));
    const quelmSheet = await sheetOf((await createdTokenOf(quelmEvents)).id, 'table', live.quelm);

    const ack = await send(ana, 'sheet:adjustBar', adjust(quelmSheet, pvId));

    expect(ack).toMatchObject({ ok: false, error: { code: 'SHEET_NOT_FOUND' } });
  });

  it('a forged userId or tokenId in the payload is refused by the strict DTO', async () => {
    const { bia, lyra, pvId } = await lyraOnTwoGrids();
    const sheetId = await sheetOf(lyra.id);

    const forged = await send(bia, 'sheet:adjustBar', {
      ...adjust(sheetId, pvId),
      userId: live.ana.id,
    });
    const named = await send(bia, 'sheet:adjustBar', {
      ...adjust(sheetId, pvId),
      tokenId: lyra.id,
    });

    expect(forged).toMatchObject({ ok: false, error: { code: 'INVALID_BODY' } });
    expect(named).toMatchObject({ ok: false, error: { code: 'INVALID_BODY' } });
  });

  it('a sheet nobody holds is SHEET_HAS_NO_TOKEN to Ana and nobody hears a change', async () => {
    const { ana, pvId } = await lyraOnTwoGrids();
    const sheetId = await sheetOf(null);
    await silence();
    const anaEvents = recordEventsOf(ana);

    const ack = await send(ana, 'sheet:adjustBar', adjust(sheetId, pvId));

    expect(ack).toMatchObject({
      ok: false,
      error: { code: 'SHEET_HAS_NO_TOKEN', message: 'This sheet is not held by a token' },
    });
    await silence();
    expect(anaEvents.events.filter(({ name }) => name === 'token:updated')).toEqual([]);
  });
});

function spend(sheetId: string, costs: readonly object[]) {
  return { ...envelope(live.vharn.id), sheetId, costs };
}

function barOf(state: Awaited<ReturnType<typeof synced>>, tokenId: string, label: string) {
  return tokenIn(state, tokenId).bars.find((bar) => bar.label === label);
}

function heardBars(events: ReturnType<typeof recordEventsOf>): string[] {
  const names = events.events.map(({ name }) => name);
  return names.filter((name) => name === 'token:updated' || name === 'character:changed');
}

describe('sheet:spendBars', () => {
  it('Bia pays PV 7 and Inspiração 1 through the sheet of Lyra in one character:changed', async () => {
    const { bia, caio, lyra, estrada, lyraOfEstrada, pvId } = await lyraOnTwoGrids();
    const inspirationId = barOf(await synced(bia, live.vharn), lyra.id, 'Inspiração')?.id ?? '';
    const sheetId = await sheetOf(lyra.id);
    await silence();
    const caioEvents = recordEventsOf(caio);

    const costs = [
      { barId: pvId, amount: 7 },
      { barId: inspirationId, amount: 1 },
    ];
    const ack = await send(bia, 'sheet:spendBars', spend(sheetId, costs));

    expect(ack).toMatchObject({ ok: true, version: expect.any(Number) });
    const heard = characterChangedEventDto.parse(
      await eventPayload(caioEvents, 'character:changed'),
    );
    expect(ack.ok && ack.version).toBe(heard.version);
    await silence();
    expect(heardBars(caioEvents)).toEqual(['character:changed']);
    const estradaState = await gridState(bia, live.vharn, estrada);
    expect(barOf(estradaState, lyraOfEstrada, 'PV')?.current).toBe(25);
    expect(barOf(estradaState, lyraOfEstrada, 'Inspiração')?.current).toBe(0);
  });

  it('Inspiração 1 cannot pay 2: INSUFFICIENT_BAR, PV untouched and nobody hears a change', async () => {
    const { ana, bia, lyra, pvId } = await lyraOnTwoGrids();
    const inspirationId = barOf(await synced(bia, live.vharn), lyra.id, 'Inspiração')?.id ?? '';
    const sheetId = await sheetOf(lyra.id);
    await silence();
    const anaEvents = recordEventsOf(ana);

    const costs = [
      { barId: pvId, amount: 7 },
      { barId: inspirationId, amount: 2 },
    ];
    const ack = await send(bia, 'sheet:spendBars', spend(sheetId, costs));

    expect(ack).toMatchObject({
      ok: false,
      error: { code: 'INSUFFICIENT_BAR', message: 'Bar "Inspiração" has 1; expected at least 2' },
    });
    await silence();
    expect(heardBars(anaEvents)).toEqual([]);
    expect(pvOf(await synced(bia, live.vharn), lyra.id)).toBe(32);
  });

  it('the sheet of an unlinked Lyra pays from her token on the group grid', async () => {
    const { bia, lyra } = await lyraPoisonedAtVharn(live);
    const pvId = tokenIn(await synced(bia, live.vharn), lyra.id).bars[0]?.id ?? '';
    const sheetId = await sheetOf(lyra.id);

    const ack = await send(bia, 'sheet:spendBars', spend(sheetId, [{ barId: pvId, amount: 2 }]));

    expect(ack).toMatchObject({ ok: true });
    expect(pvOf(await synced(bia, live.vharn), lyra.id)).toBe(30);
  });

  it('Caio on a table sheet is FORBIDDEN and nobody hears a change', async () => {
    const { ana, caio, lyra, pvId } = await lyraOnTwoGrids();
    const sheetId = await sheetOf(lyra.id, 'table');
    await silence();
    const anaEvents = recordEventsOf(ana);

    const ack = await send(caio, 'sheet:spendBars', spend(sheetId, [{ barId: pvId, amount: 1 }]));

    expect(ack).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    await silence();
    expect(heardBars(anaEvents)).toEqual([]);
  });

  it('a bar of a token at Quelm is BAR_NOT_FOUND through the sheet of Lyra', async () => {
    const { bia, lyra } = await lyraOnTwoGrids();
    const caio = await live.atTable(live.caio, live.quelm);
    const quelmEvents = recordEventsOf(caio);
    await send(caio, 'token:create', tokenCommandFor(live.quelm, live.caio.id));
    const quelmBarId = (await createdTokenOf(quelmEvents)).bars[0]?.id ?? '';
    const sheetId = await sheetOf(lyra.id);

    const costs = [{ barId: quelmBarId, amount: 1 }];
    const ack = await send(bia, 'sheet:spendBars', spend(sheetId, costs));

    expect(ack).toMatchObject({ ok: false, error: { code: 'BAR_NOT_FOUND' } });
  });

  it('a sheet nobody holds is SHEET_HAS_NO_TOKEN to Ana', async () => {
    const { ana, pvId } = await lyraOnTwoGrids();
    const sheetId = await sheetOf(null);

    const ack = await send(ana, 'sheet:spendBars', spend(sheetId, [{ barId: pvId, amount: 1 }]));

    expect(ack).toMatchObject({ ok: false, error: { code: 'SHEET_HAS_NO_TOKEN' } });
  });

  it('a forged tokenId in the payload is refused by the strict DTO', async () => {
    const { bia, lyra, pvId } = await lyraOnTwoGrids();
    const sheetId = await sheetOf(lyra.id);

    const named = await send(bia, 'sheet:spendBars', {
      ...spend(sheetId, [{ barId: pvId, amount: 1 }]),
      tokenId: lyra.id,
    });

    expect(named).toMatchObject({ ok: false, error: { code: 'INVALID_BODY' } });
  });
});
