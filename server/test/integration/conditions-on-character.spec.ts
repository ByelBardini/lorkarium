import {
  characterChangedEventDto,
  combatStartedDto,
  combatTurnChangedDto,
  conditionsAppliedDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { gridState, poison, tokenIn } from '../support/characters';
import { gridAck, newGrid, setGridVisibility } from '../support/grids';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
import { charactersSynced, lyraBarsOnBia, wearCharacter } from '../support/table-characters';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();

// Lyra, Bia's character, worn by a token on the Salão (the group grid) and one on the public
// Estrada, which everyone has open; Kael, Caio's unlinked token, on the Salão.
async function lyraOnTwoGrids() {
  const ana = await live.atTable(live.ana, live.vharn);
  const bia = await live.atTable(live.bia, live.vharn);
  const caio = await live.atTable(live.caio, live.vharn);
  const characterId = await lyraBarsOnBia(live);
  const lyra = await tokenOn(ana, tokenCommandFor(live.vharn, live.bia.id));
  const kael = await tokenOn(ana, tokenCommandFor(live.vharn, live.caio.id, { name: 'Kael' }));
  const estrada = await newGrid(live, live.ana, live.vharn, 'Estrada');
  await setGridVisibility(live, live.ana, live.vharn, estrada, 'public');
  for (const client of [ana, bia, caio]) await gridAck(client, 'scene:watch', live.vharn, estrada);
  const onEstrada = { ...tokenCommandFor(live.vharn, live.bia.id), sceneId: estrada };
  const lyraOfEstrada = await tokenOn(ana, onEstrada);
  await wearCharacter(live, lyra, characterId);
  await wearCharacter(live, lyraOfEstrada, characterId);
  return { ana, bia, caio, characterId, lyra, kael, estrada, lyraOfEstrada };
}

async function tokenOn(
  ana: Awaited<ReturnType<typeof live.atTable>>,
  command: object,
): Promise<string> {
  const created = recordEventsOf(ana);
  await send(ana, 'token:create', command);
  return (await createdTokenOf(created)).id;
}

function conditionNamesOf(state: Awaited<ReturnType<typeof synced>>, tokenId: string): string[] {
  return tokenIn(state, tokenId).conditions.map(({ name }) => name);
}

async function definitionId(name: string): Promise<string> {
  const ana = await live.atTable(live.ana, live.vharn);
  const found = (await synced(ana, live.vharn)).conditionDefinitions.find((d) => d.name === name);
  if (!found) throw new Error(`the table has no ${name}`);
  return found.id;
}

describe('a condition on a linked token lives on its character', () => {
  it('Bia poisons Lyra on the Salão: Caio hears character:changed with it and the Estrada shows it too', async () => {
    const { bia, caio, characterId, lyra, estrada, lyraOfEstrada } = await lyraOnTwoGrids();
    const salaoBefore = (await synced(bia, live.vharn)).version;
    const caioEvents = recordEventsOf(caio);

    await poison(bia, live.vharn, lyra);

    const heard = characterChangedEventDto.parse(
      await eventPayload(caioEvents, 'character:changed'),
    );
    expect(heard.characters.map(({ id }) => id)).toEqual([characterId]);
    expect(heard.characters[0]?.conditions.map(({ name }) => name)).toEqual(['Envenenado']);
    await silence();
    expect(caioEvents.events.map(({ name }) => name)).not.toContain('condition:applied');
    const salao = await synced(bia, live.vharn);
    expect(salao.version).toBe(salaoBefore);
    expect(conditionNamesOf(salao, lyra)).toEqual(['Envenenado']);
    const onEstrada = await gridState(caio, live.vharn, estrada);
    expect(conditionNamesOf(onEstrada, lyraOfEstrada)).toEqual(['Envenenado']);
  });

  it('the ack of the apply is the characters version, and character:sync brings the condition', async () => {
    const { bia, caio, lyra } = await lyraOnTwoGrids();
    const command = {
      ...envelope(live.vharn.id),
      tokenId: lyra,
      conditionId: await definitionId('Envenenado'),
      rounds: 0,
    };

    const ack = await send(bia, 'condition:apply', command);

    const synced = await charactersSynced(caio, live.vharn);
    expect(ack).toMatchObject({ ok: true, version: synced.version });
    const lyraSynced = synced.characters.find(({ name }) => name === 'Lyra');
    expect(lyraSynced?.conditions.map(({ name }) => name)).toEqual(['Envenenado']);
  });

  it('Lyra and Kael poisoned together: one character:changed and one condition:appliedMany with Kael only', async () => {
    const { ana, caio, characterId, lyra, kael } = await lyraOnTwoGrids();
    const caioEvents = recordEventsOf(caio);
    const command = {
      ...envelope(live.vharn.id),
      tokenIds: [lyra, kael],
      conditionId: await definitionId('Envenenado'),
      rounds: 0,
    };

    expect(await send(ana, 'condition:applyMany', command)).toMatchObject({ ok: true });

    const changed = characterChangedEventDto.parse(
      await eventPayload(caioEvents, 'character:changed'),
    );
    expect(changed.characters.map(({ id }) => id)).toEqual([characterId]);
    const applied = conditionsAppliedDto.parse(
      await eventPayload(caioEvents, 'condition:appliedMany'),
    );
    expect(applied.applied.map(({ tokenId }) => tokenId)).toEqual([kael]);
  });

  it('removing it from the Lyra of the Estrada takes it off the Salão too', async () => {
    const { bia, lyra, estrada, lyraOfEstrada } = await lyraOnTwoGrids();
    await poison(bia, live.vharn, lyra);
    const onEstrada = tokenIn(await gridState(bia, live.vharn, estrada), lyraOfEstrada);
    const activeConditionId = onEstrada.conditions[0]?.id ?? '';

    const remove = { ...envelope(live.vharn.id), sceneId: estrada, tokenId: lyraOfEstrada };
    const ack = await send(bia, 'condition:remove', { ...remove, activeConditionId });

    expect(ack).toMatchObject({ ok: true });
    expect(conditionNamesOf(await synced(bia, live.vharn), lyra)).toEqual([]);
  });

  it('a condition on a Lyra of Vharn reaches nobody at Quelm, and Quelm cannot name her', async () => {
    const { bia, lyra } = await lyraOnTwoGrids();
    const quelm = await live.atTable(live.caio, live.quelm);
    const quelmEvents = recordEventsOf(quelm);

    await poison(bia, live.vharn, lyra);
    const fromQuelm = { ...envelope(live.quelm.id), tokenId: lyra, conditionId: lyra, rounds: 0 };
    const ack = await send(quelm, 'condition:apply', fromQuelm);

    expect(ack).toMatchObject({ ok: false, error: { code: 'TOKEN_NOT_FOUND' } });
    await silence();
    expect(quelmEvents.events).toEqual([]);
  });
});

// Lyra alone in a combat of the Salão, Envenenado (1 round) applied to her in round 1.
async function lyraFightingInTheSalao() {
  const table = await lyraOnTwoGrids();
  const entries = [{ name: null, tokenIds: [table.lyra], initiative: null }];
  const started = recordEventsOf(table.ana);
  await send(table.ana, 'combat:start', { ...envelope(live.vharn.id), entries });
  const combat = combatStartedDto.parse(await eventPayload(started, 'combat:started')).combat;
  await poison(table.ana, live.vharn, table.lyra, undefined, 1);
  const turn = { ...envelope(live.vharn.id), fromCombatantId: combat.combatants[0]?.id ?? '' };
  return { ...table, turn };
}

describe('the end of the turn of a linked token counts down its character', () => {
  it('the Envenenado of 1 round ends with Lyra turn: character:changed without it, the Estrada clean', async () => {
    const { bia, caio, characterId, estrada, lyraOfEstrada, turn } = await lyraFightingInTheSalao();
    expect(await send(bia, 'combat:nextTurn', turn)).toMatchObject({ ok: true });
    const before = tokenIn(await gridState(caio, live.vharn, estrada), lyraOfEstrada);
    expect(before.conditions.map(({ name }) => name)).toEqual(['Envenenado']);
    const caioEvents = recordEventsOf(caio);

    expect(await send(bia, 'combat:nextTurn', turn)).toMatchObject({ ok: true });

    const changed = characterChangedEventDto.parse(
      await eventPayload(caioEvents, 'character:changed'),
    );
    expect(changed.characters).toEqual([expect.objectContaining({ id: characterId })]);
    expect(changed.characters[0]?.conditions).toEqual([]);
    const turned = combatTurnChangedDto.parse(await eventPayload(caioEvents, 'combat:turnChanged'));
    expect(turned.conditionChanges).toEqual([]);
    expect(caioEvents.events.map(({ name }) => name)).not.toContain('condition:changedMany');
    const after = tokenIn(await gridState(caio, live.vharn, estrada), lyraOfEstrada);
    expect(after.conditions).toEqual([]);
  });

  it('Caio, who does not control Lyra, cannot end her turn: FORBIDDEN and nobody hears a thing', async () => {
    const { ana, caio, turn } = await lyraFightingInTheSalao();
    const anaEvents = recordEventsOf(ana);

    const ack = await send(caio, 'combat:nextTurn', turn);

    expect(ack).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    await silence();
    expect(anaEvents.events).toEqual([]);
  });

  it('a restart keeps the expired condition gone from every grid', async () => {
    const { bia, lyra, estrada, lyraOfEstrada, turn } = await lyraFightingInTheSalao();
    await send(bia, 'combat:nextTurn', turn);
    await send(bia, 'combat:nextTurn', turn);

    await live.restart();

    const ana = await live.atTable(live.ana, live.vharn);
    expect(conditionNamesOf(await synced(ana, live.vharn), lyra)).toEqual([]);
    const onEstrada = await gridState(ana, live.vharn, estrada);
    expect(conditionNamesOf(onEstrada, lyraOfEstrada)).toEqual([]);
  });
});
