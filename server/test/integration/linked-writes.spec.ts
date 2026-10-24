import { tokenUpdatedDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  castIdOf,
  gridState,
  linkToCard,
  lyraPoisonedAtVharn,
  tokenIn,
} from '../support/characters';
import { gridAck, newGrid, setGridVisibility } from '../support/grids';
import { envelope, eventPayload, send, synced } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();

// Lyra of Bia on the Salão (the group grid) and on the public Estrada, both linked to her card;
// Caio has the Estrada open.
async function lyraOnTwoGrids() {
  const castId = await castIdOf(live, live.ana, live.vharn);
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
  await linkToCard(ana, live.vharn, {
    sceneId: estrada,
    tokenId: lyraOfEstrada,
    memberId: live.bia.id,
  });
  return { ...table, castId, estrada, lyraOfEstrada };
}

function pvOf(state: Awaited<ReturnType<typeof synced>>, tokenId: string): number | undefined {
  return tokenIn(state, tokenId).bars.find(({ label }) => label === 'PV')?.current;
}

describe('shared writes on a linked token go to its anchor', () => {
  it('Bia takes 7 PV from Lyra on the Salão: Caio hears the anchor through the cast and the Estrada already shows it', async () => {
    const { bia, caio, lyra, castId, estrada, lyraOfEstrada } = await lyraOnTwoGrids();
    const caioEvents = recordEventsOf(caio);
    const pvId = tokenIn(await synced(bia, live.vharn), lyra.id).bars[0]?.id ?? '';

    const change = { op: 'add', amount: -7 };
    const adjust = { ...envelope(live.vharn.id), tokenId: lyra.id, barId: pvId, change };
    expect(await send(bia, 'token:adjustBar', adjust)).toMatchObject({ ok: true });

    const heard = tokenUpdatedDto.parse(await eventPayload(caioEvents, 'token:updated'));
    expect(heard.sceneId).toBe(castId);
    expect(pvOf(await gridState(bia, live.vharn, estrada), lyraOfEstrada)).toBe(25);
    expect(pvOf(await synced(bia, live.vharn), lyra.id)).toBe(25);
  });

  it('the Envenenado of Lyra on the Salão is on the Lyra of the Estrada too', async () => {
    const { ana, lyraOfEstrada, estrada } = await lyraOnTwoGrids();

    const onEstrada = tokenIn(await gridState(ana, live.vharn, estrada), lyraOfEstrada);

    expect(onEstrada.conditions.map(({ name }) => name)).toEqual(['Envenenado']);
  });

  it('a condition put on the Lyra of the Estrada shows on the Salão', async () => {
    const { ana, lyra, estrada, lyraOfEstrada } = await lyraOnTwoGrids();
    const definitions = (await synced(ana, live.vharn)).conditionDefinitions;
    const caido = definitions.find(({ name }) => name === 'Caído')?.id ?? '';

    const apply = { ...envelope(live.vharn.id), sceneId: estrada, tokenId: lyraOfEstrada };
    const ack = await send(ana, 'condition:apply', { ...apply, conditionId: caido, rounds: 0 });
    expect(ack).toMatchObject({ ok: true });

    const onSalao = tokenIn(await synced(ana, live.vharn), lyra.id);
    expect(onSalao.conditions.map(({ name }) => name).sort()).toEqual(['Caído', 'Envenenado']);
  });

  it('the light of Lyra on the Salão does not light the one of the Estrada', async () => {
    const { ana, lyra, estrada, lyraOfEstrada } = await lyraOnTwoGrids();
    const shown = tokenIn(await synced(ana, live.vharn), lyra.id);
    const bars = shown.bars.map(({ label, current, max, color, visibility, display }) => ({
      ...{ label, current, max, color, visibility, display },
    }));
    const { name, initials, side, width, height, controllerIds } = shown;
    const light = { bright: 4, dim: 4, color: 'fire', angle: 360 };
    const update = { ...envelope(live.vharn.id), tokenId: lyra.id, light, bars, controllerIds };
    expect(
      await send(ana, 'token:update', { ...update, name, initials, side, width, height }),
    ).toMatchObject({ ok: true });

    expect(tokenIn(await synced(ana, live.vharn), lyra.id).light).toMatchObject({ bright: 4 });
    expect(tokenIn(await gridState(ana, live.vharn, estrada), lyraOfEstrada).light).toBeNull();
  });

  it('Caio on the PV of Lyra is FORBIDDEN, on any grid', async () => {
    const { bia, caio, lyra } = await lyraOnTwoGrids();
    const pvId = tokenIn(await synced(bia, live.vharn), lyra.id).bars[0]?.id ?? '';

    const adjust = { ...envelope(live.vharn.id), tokenId: lyra.id, barId: pvId };
    const ack = await send(caio, 'token:adjustBar', {
      ...adjust,
      change: { op: 'add', amount: -1 },
    });

    expect(ack).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('Bia moves and drags the Lyra of the Estrada: her control comes from the anchor', async () => {
    const { bia, estrada, lyraOfEstrada } = await lyraOnTwoGrids();
    const base = { ...envelope(live.vharn.id), sceneId: estrada, tokenId: lyraOfEstrada };

    expect(await send(bia, 'token:move', { ...base, col: 6, row: 6 })).toMatchObject({ ok: true });
    const drags = [{ tokenId: lyraOfEstrada, cell: { col: 7, row: 6 } }];
    const drag = { ...envelope(live.vharn.id), sceneId: estrada, drags };
    expect(await send(bia, 'token:dragMany', drag)).toMatchObject({ ok: true });
  });

  it('the cast is always locked before a grid: 50 rounds of crossed writes on both grids all pass', async () => {
    const { ana, bia, lyra, estrada, lyraOfEstrada } = await lyraOnTwoGrids();
    const pvId = tokenIn(await synced(bia, live.vharn), lyra.id).bars[0]?.id ?? '';
    const style = (defeated: boolean) => ({
      ...envelope(live.vharn.id),
      sceneId: estrada,
      tokenIds: [lyraOfEstrada],
      style: { defeated, flipX: defeated },
    });
    const adjust = (amount: number) => ({
      ...envelope(live.vharn.id),
      tokenId: lyra.id,
      barId: pvId,
      change: { op: 'add', amount },
    });

    const acks = [];
    for (let round = 0; round < 50; round += 1) {
      const even = round % 2 === 0;
      acks.push(
        ...(await Promise.all([
          send(bia, 'token:adjustBar', adjust(even ? -1 : 1)),
          send(ana, 'token:restyleMany', style(even)),
        ])),
      );
    }

    expect(acks.every((ack) => ack.ok)).toBe(true);
    expect(pvOf(await synced(bia, live.vharn), lyra.id)).toBe(32);
  });
});
