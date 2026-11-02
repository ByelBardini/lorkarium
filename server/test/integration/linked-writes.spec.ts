import { characterChangedEventDto } from '@lorkarium/contracts';
import { setTimeout as sleep } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { COMMANDS_PER_SECOND } from '../../src/realtime/command-rate.bo';
import {
  gridState,
  linkToPlayerCharacter,
  lyraPoisonedAtVharn,
  tokenIn,
} from '../support/characters';
import { gridAck, newGrid, setGridVisibility } from '../support/grids';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
import {
  CHARACTER_MANA,
  characterOfUser,
  giveBars,
  poisonCharacter,
} from '../support/table-characters';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();
const LYRA_PV = {
  label: 'PV',
  current: 32,
  max: 45,
  color: 'ember',
  visibility: 'controllers',
} as const;

// Lyra of Bia on the Salão (the group grid) and on the public Estrada, both linked to her card,
// so both wear Bia's character, which holds PV 32/45 (controllers only) and Mana 4/10; Caio has
// the Estrada open.
async function lyraOnTwoGrids() {
  const table = await lyraPoisonedAtVharn(live);
  const { ana, bia, caio, lyra } = table;
  await linkToPlayerCharacter(live, ana, live.vharn, { tokenId: lyra.id, memberId: live.bia.id });
  const character = await characterOfUser(live, live.vharn, live.bia);
  await giveBars(live, character.character.id, [LYRA_PV, CHARACTER_MANA]);
  // A link drops the token's own Envenenado (phase 8); the character holds one instead.
  await poisonCharacter(live, ana, character.character.id);
  const estrada = await newGrid(live, live.ana, live.vharn, 'Estrada');
  await setGridVisibility(live, live.ana, live.vharn, estrada, 'public');
  for (const client of [ana, bia, caio]) await gridAck(client, 'scene:watch', live.vharn, estrada);
  const anaEvents = recordEventsOf(ana);
  const command = { ...tokenCommandFor(live.vharn, live.bia.id), sceneId: estrada, bars: [] };
  await send(ana, 'token:create', command);
  const lyraOfEstrada = (await createdTokenOf(anaEvents)).id;
  await linkToPlayerCharacter(live, ana, live.vharn, {
    sceneId: estrada,
    tokenId: lyraOfEstrada,
    memberId: live.bia.id,
  });
  return { ...table, characterId: character.character.id, estrada, lyraOfEstrada };
}

function pvOf(state: Awaited<ReturnType<typeof synced>>, tokenId: string): number | undefined {
  return tokenIn(state, tokenId).bars.find(({ label }) => label === 'PV')?.current;
}

describe('shared writes on a linked token go to its character', () => {
  it('Bia takes 7 PV from Lyra on the Salão: Caio hears character:changed and the Estrada already shows it', async () => {
    const { bia, caio, lyra, characterId, estrada, lyraOfEstrada } = await lyraOnTwoGrids();
    const caioEvents = recordEventsOf(caio);
    const salaoBefore = (await synced(bia, live.vharn)).version;
    const pvId = tokenIn(await synced(bia, live.vharn), lyra.id).bars[0]?.id ?? '';

    const change = { op: 'add', amount: -7 };
    const adjust = { ...envelope(live.vharn.id), tokenId: lyra.id, barId: pvId, change };
    const ack = await send(bia, 'token:adjustBar', adjust);
    expect(ack).toMatchObject({ ok: true });

    const heard = characterChangedEventDto.parse(
      await eventPayload(caioEvents, 'character:changed'),
    );
    expect(heard.characters.map(({ id }) => id)).toEqual([characterId]);
    expect(heard.characters[0]?.bars.map(({ label }) => label)).toEqual(['Mana']);
    expect(ack).toMatchObject({ version: heard.version });
    await silence();
    expect(caioEvents.events.map(({ name }) => name)).not.toContain('token:updated');
    expect(pvOf(await gridState(bia, live.vharn, estrada), lyraOfEstrada)).toBe(25);
    const salao = await synced(bia, live.vharn);
    expect(pvOf(salao, lyra.id)).toBe(25);
    expect(salao.version).toBe(salaoBefore);
  });

  it('the snapshot of both grids names the character of Lyra', async () => {
    const { ana, lyra, characterId, estrada, lyraOfEstrada } = await lyraOnTwoGrids();

    expect(tokenIn(await synced(ana, live.vharn), lyra.id).characterId).toBe(characterId);
    const onEstrada = tokenIn(await gridState(ana, live.vharn, estrada), lyraOfEstrada);
    expect(onEstrada.characterId).toBe(characterId);
  });

  it('a new name for Lyra on the Estrada is the name of the Lyra of the Salão', async () => {
    const { ana, lyra, estrada, lyraOfEstrada } = await lyraOnTwoGrids();
    const shown = tokenIn(await gridState(ana, live.vharn, estrada), lyraOfEstrada);
    const bars = shown.bars.map(({ label, current, max, color, visibility, display }) => ({
      ...{ label, current, max, color, visibility, display },
    }));
    const { initials, side, width, height, controllerIds } = shown;
    const update = { ...envelope(live.vharn.id), sceneId: estrada, tokenId: lyraOfEstrada };
    const fields = { name: 'Lyra Vento', initials, side, width, height, controllerIds, bars };
    expect(await send(ana, 'token:update', { ...update, ...fields })).toMatchObject({ ok: true });

    expect(tokenIn(await synced(ana, live.vharn), lyra.id).name).toBe('Lyra Vento');
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

  it('Bia moves and drags the Lyra of the Estrada: her control comes from the character', async () => {
    const { bia, estrada, lyraOfEstrada } = await lyraOnTwoGrids();
    const base = { ...envelope(live.vharn.id), sceneId: estrada, tokenId: lyraOfEstrada };

    expect(await send(bia, 'token:move', { ...base, col: 6, row: 6 })).toMatchObject({ ok: true });
    const drags = [{ tokenId: lyraOfEstrada, cell: { col: 7, row: 6 } }];
    const drag = { ...envelope(live.vharn.id), sceneId: estrada, drags };
    expect(await send(bia, 'token:dragMany', drag)).toMatchObject({ ok: true });
  });

  it('the characters are always locked before a grid: 50 rounds of crossed writes on both grids all pass', async () => {
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
      // The race is inside a round; across rounds, keep each socket under the command bucket
      // (burst 40): on a fast CI runner 50 back-to-back rounds came back RATE_LIMITED.
      await sleep(1000 / COMMANDS_PER_SECOND);
    }

    expect(acks.filter((ack) => !ack.ok)).toEqual([]);
    expect(pvOf(await synced(bia, live.vharn), lyra.id)).toBe(32);
    // 50 paced rounds take 2.5 s on their own, beside the setup.
  }, 20_000);

  it('a write on the Lyra of Vharn reaches nobody at Quelm', async () => {
    const { bia, lyra } = await lyraOnTwoGrids();
    const quelmEvents = recordEventsOf(await live.atTable(live.caio, live.quelm));
    const pvId = tokenIn(await synced(bia, live.vharn), lyra.id).bars[0]?.id ?? '';

    const adjust = { ...envelope(live.vharn.id), tokenId: lyra.id, barId: pvId };
    await send(bia, 'token:adjustBar', { ...adjust, change: { op: 'add', amount: -1 } });

    await silence();
    expect(quelmEvents.events.map(({ name }) => name)).not.toContain('character:changed');
  });
});

describe('a player edits the token of her character', () => {
  it('Bia renames Lyra with the table keys off, and her sight stays closed', async () => {
    const { bia, lyra, characterId } = await lyraOnTwoGrids();
    const state = await synced(bia, live.vharn);
    const { id, name, initials, side, width, height, bars, controllerIds } = tokenIn(
      state,
      lyra.id,
    );
    const edit = { tokenId: id, initials, side, width, height, controllerIds };
    const editBars = bars.map(({ label, current, max, color, visibility, display }) => {
      return { label, current, max, color, visibility, display };
    });
    expect(name).not.toBe('Lyra, a Rubra');

    const renamed = { ...edit, name: 'Lyra, a Rubra', bars: editBars };
    const ack = await send(bia, 'token:update', { ...envelope(live.vharn.id), ...renamed });
    const blinded = { ...renamed, sight: { bright: 60, dim: 60 } };
    const refused = await send(bia, 'token:update', { ...envelope(live.vharn.id), ...blinded });

    expect(ack).toMatchObject({ ok: true });
    expect(refused).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    const after = await characterOfUser(live, live.vharn, live.bia);
    expect([after.character.id, after.character.name]).toEqual([characterId, 'Lyra, a Rubra']);
  });

  it('Caio, who does not control her, is refused', async () => {
    const { caio, lyra } = await lyraOnTwoGrids();
    const update = { tokenId: lyra.id, name: 'Roubada', initials: 'RO', side: 'ally' as const };
    const command = { ...update, width: 1, height: 1, bars: [], controllerIds: [live.caio.id] };

    const ack = await send(caio, 'token:update', { ...envelope(live.vharn.id), ...command });

    expect(ack).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });
});
