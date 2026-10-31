import {
  sheetTemplateResponseDto,
  sheetWriteResponseDto,
  tokenUpdatedDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  castIdOf,
  gridState,
  linkToCard,
  lyraPoisonedAtVharn,
  tokenIn,
} from '../support/characters';
import { gridAck, newGrid, setGridVisibility } from '../support/grids';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
import type { Table } from '../support/tables';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();
const CODE = { html: '<p></p>', css: '', js: '' };

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
  await linkToCard(ana, live.vharn, { tokenId: lyra.id, memberId: live.bia.id });
  const estrada = await newGrid(live, live.ana, live.vharn, 'Estrada');
  await setGridVisibility(live, live.ana, live.vharn, estrada, 'public');
  for (const client of [ana, bia, caio]) await gridAck(client, 'scene:watch', live.vharn, estrada);
  const anaEvents = recordEventsOf(ana);
  const command = { ...tokenCommandFor(live.vharn, live.bia.id), sceneId: estrada, bars: [] };
  await send(ana, 'token:create', command);
  const lyraOfEstrada = (await createdTokenOf(anaEvents)).id;
  const link = { sceneId: estrada, tokenId: lyraOfEstrada, memberId: live.bia.id };
  await linkToCard(ana, live.vharn, link);
  const pvId = tokenIn(await synced(bia, live.vharn), lyra.id).bars[0]?.id ?? '';
  return { ...table, estrada, lyraOfEstrada, pvId };
}

function pvOf(state: Awaited<ReturnType<typeof synced>>, tokenId: string): number | undefined {
  return tokenIn(state, tokenId).bars.find(({ label }) => label === 'PV')?.current;
}

describe('sheet:adjustBar', () => {
  it('Bia takes 7 PV through the sheet of Lyra: Caio hears the anchor and the Estrada shows 25', async () => {
    const { bia, caio, lyra, estrada, lyraOfEstrada, pvId } = await lyraOnTwoGrids();
    const sheetId = await sheetOf(lyra.id);
    const castId = await castIdOf(live, live.ana, live.vharn);
    await silence();
    const caioEvents = recordEventsOf(caio);

    const ack = await send(bia, 'sheet:adjustBar', adjust(sheetId, pvId));

    expect(ack).toMatchObject({ ok: true, version: expect.any(Number) });
    const heard = tokenUpdatedDto.parse(await eventPayload(caioEvents, 'token:updated'));
    expect(heard.sceneId).toBe(castId);
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
    expect(anaEvents.events.filter(({ name }) => name === 'token:updated')).toEqual([]);
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
