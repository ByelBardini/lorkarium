import { combatStartedDto, conditionsChangedDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { castIdOf, gridState, linkToCard, poison, tokenIn } from '../support/characters';
import { gridAck, newGrid, setGridVisibility } from '../support/grids';
import { envelope, eventPayload, send, synced } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();

// Lyra of Bia alone in a combat of the Salão and linked to her card; another Lyra of the same
// card on the public Estrada, which Caio has open. Envenenado (1 round) applied in round 1.
async function lyraFightingInTheSalao() {
  const ana = await live.atTable(live.ana, live.vharn);
  const bia = await live.atTable(live.bia, live.vharn);
  const caio = await live.atTable(live.caio, live.vharn);
  const anaEvents = recordEventsOf(ana);
  await send(ana, 'token:create', tokenCommandFor(live.vharn, live.bia.id));
  const lyra = await createdTokenOf(anaEvents);
  await linkToCard(ana, live.vharn, { tokenId: lyra.id, memberId: live.bia.id });
  const estrada = await newGrid(live, live.ana, live.vharn, 'Estrada');
  await setGridVisibility(live, live.ana, live.vharn, estrada, 'public');
  await gridAck(caio, 'scene:watch', live.vharn, estrada);
  await gridAck(ana, 'scene:watch', live.vharn, estrada);
  const estradaEvents = recordEventsOf(ana);
  await send(ana, 'token:create', {
    ...tokenCommandFor(live.vharn, live.bia.id),
    sceneId: estrada,
  });
  const lyraOfEstrada = (await createdTokenOf(estradaEvents)).id;
  await linkToCard(ana, live.vharn, {
    sceneId: estrada,
    tokenId: lyraOfEstrada,
    memberId: live.bia.id,
  });
  const entries = [{ name: null, tokenIds: [lyra.id], initiative: null }];
  const started = recordEventsOf(ana);
  await send(ana, 'combat:start', { ...envelope(live.vharn.id), entries });
  const combat = combatStartedDto.parse(await eventPayload(started, 'combat:started')).combat;
  await poison(ana, live.vharn, lyra.id, undefined, 1);
  const entryId = combat.combatants[0]?.id ?? '';
  return { ana, bia, caio, lyra, estrada, lyraOfEstrada, entryId };
}

describe('the end of the turn of a linked token (condition:changedMany)', () => {
  it('the Envenenado of 1 round ends with Lyra turn in the Salão and goes from the Lyra of the Estrada', async () => {
    const castId = await castIdOf(live, live.ana, live.vharn);
    const { bia, caio, estrada, lyraOfEstrada, entryId } = await lyraFightingInTheSalao();
    const turn = { ...envelope(live.vharn.id), fromCombatantId: entryId };
    expect(await send(bia, 'combat:nextTurn', turn)).toMatchObject({ ok: true });
    const onEstrada = tokenIn(await gridState(caio, live.vharn, estrada), lyraOfEstrada);
    expect(onEstrada.conditions.map(({ name }) => name)).toEqual(['Envenenado']);
    const caioEvents = recordEventsOf(caio);

    expect(await send(bia, 'combat:nextTurn', turn)).toMatchObject({ ok: true });

    const changed = conditionsChangedDto.parse(
      await eventPayload(caioEvents, 'condition:changedMany'),
    );
    expect(changed).toMatchObject({ sceneId: castId, changes: [{ conditions: [] }] });
    const after = tokenIn(await gridState(caio, live.vharn, estrada), lyraOfEstrada);
    expect(after.conditions).toEqual([]);
  });

  it('a restart keeps the expired condition gone', async () => {
    const { bia, lyra, entryId } = await lyraFightingInTheSalao();
    const turn = { ...envelope(live.vharn.id), fromCombatantId: entryId };
    await send(bia, 'combat:nextTurn', turn);
    await send(bia, 'combat:nextTurn', turn);

    await live.restart();

    const ana = await live.atTable(live.ana, live.vharn);
    expect(tokenIn(await synced(ana, live.vharn), lyra.id).conditions).toEqual([]);
  });
});
