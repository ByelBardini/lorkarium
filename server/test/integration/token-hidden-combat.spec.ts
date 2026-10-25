import { combatTurnChangedDto, combatUpdatedDto, type CombatDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { expectNoTrace, hiddenTable, namesOf, type HiddenTable } from '../support/hidden-tokens';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import type { EventRecorder } from '../support/realtime-client';
import { useTokenTable } from '../support/token-table';

describe('conditions and combat that touch a hidden token', () => {
  const live = useTokenTable();
  const on = (fields: object): object => ({ ...envelope(live.vharn.id), ...fields });

  async function conditionIdOf(table: HiddenTable): Promise<string> {
    const state = await synced(table.ana.client, live.vharn);
    const first = state.conditionDefinitions[0];
    if (!first) throw new Error('the table was born without its default conditions');
    return first.id;
  }

  async function startCombat(table: HiddenTable): Promise<void> {
    const entries = [
      { name: null, tokenIds: [table.kaelId], initiative: 20 },
      { name: null, tokenIds: [table.loboId], initiative: 10 },
    ];
    expect(await send(table.ana.client, 'combat:start', on({ entries }))).toMatchObject({
      ok: true,
    });
  }

  function lastOf(recorder: EventRecorder, name: string): unknown {
    return recorder.events.filter((event) => event.name === name).at(-1)?.payload;
  }

  it('condition:apply on the Lobo: Ana and Bia get it, Caio board:advanced', async () => {
    const table = await hiddenTable(live);
    const conditionId = await conditionIdOf(table);

    await send(
      table.bia.client,
      'condition:apply',
      on({ tokenId: table.loboId, conditionId, rounds: 2 }),
    );

    expect(await eventPayload(table.ana, 'condition:applied')).toMatchObject({
      tokenId: table.loboId,
    });
    expect(await eventPayload(table.caio, 'board:advanced')).toMatchObject({ version: 3 });
    await silence();
    expect(namesOf(table.caio)).toEqual(['board:advanced']);
    expectNoTrace(table.caio, table.loboId);
  });

  it('condition:applyMany on the Lobo and the Kael reaches Caio with only the Kael', async () => {
    const table = await hiddenTable(live);
    const conditionId = await conditionIdOf(table);
    const tokenIds = [table.loboId, table.kaelId];

    await send(table.ana.client, 'condition:applyMany', on({ tokenIds, conditionId, rounds: 0 }));

    const applied = (await eventPayload(table.caio, 'condition:appliedMany')) as {
      applied: { tokenId: string }[];
    };
    expect(applied.applied.map(({ tokenId }) => tokenId)).toEqual([table.kaelId]);
    await silence();
    expectNoTrace(table.caio, table.loboId);
  });

  it('combat:start with the Lobo and the Kael: Caio sees only the Kael, Bia both', async () => {
    const table = await hiddenTable(live);

    await startCombat(table);

    const caio = (await eventPayload(table.caio, 'combat:started')) as { combat: CombatDto };
    const bia = (await eventPayload(table.bia, 'combat:started')) as { combat: CombatDto };
    expect(caio.combat.combatants.map(({ tokenIds }) => tokenIds)).toEqual([[table.kaelId]]);
    expect(bia.combat.combatants).toHaveLength(2);
    expectNoTrace(table.caio, table.loboId);
  });

  it('combat:nextTurn to the Lobo: Caio sees nobody on the turn, and its condition changes never come', async () => {
    const table = await hiddenTable(live);
    const conditionId = await conditionIdOf(table);
    await send(
      table.ana.client,
      'condition:apply',
      on({ tokenId: table.loboId, conditionId, rounds: 3 }),
    );
    await startCombat(table);
    const started = (await eventPayload(table.ana, 'combat:started')) as { combat: CombatDto };
    const kaelEntry = started.combat.currentCombatantId ?? '';

    await send(table.ana.client, 'combat:nextTurn', on({ fromCombatantId: kaelEntry }));
    await eventPayload(table.caio, 'combat:turnChanged');
    const loboEntry =
      combatTurnChangedDto.parse(lastOf(table.ana, 'combat:turnChanged')).combat
        .currentCombatantId ?? '';
    await send(table.ana.client, 'combat:nextTurn', on({ fromCombatantId: loboEntry }));

    await silence();
    const turns = table.caio.events.filter(({ name }) => name === 'combat:turnChanged');
    const first = combatTurnChangedDto.parse(turns[0]?.payload);
    expect(first.combat).toMatchObject({ currentCombatantId: null, round: 1 });
    const second = combatTurnChangedDto.parse(turns[1]?.payload);
    expect(second.conditionChanges).toEqual([]);
    expect(second.combat).toMatchObject({ currentCombatantId: kaelEntry, round: 2 });
    const biaSecond = combatTurnChangedDto.parse(lastOf(table.bia, 'combat:turnChanged'));
    expect(biaSecond.conditionChanges.map(({ tokenId }) => tokenId)).toEqual([table.loboId]);
    expectNoTrace(table.caio, table.loboId);
  });

  it("combat:regroupTokens of the Lobo into the Kael's entry: Caio sees the entry without the Lobo", async () => {
    const table = await hiddenTable(live);
    await startCombat(table);
    const started = (await eventPayload(table.ana, 'combat:started')) as { combat: CombatDto };
    const kaelEntry = started.combat.currentCombatantId ?? '';

    const target = { kind: 'entry', combatantId: kaelEntry };
    await send(table.ana.client, 'combat:regroupTokens', on({ tokenIds: [table.loboId], target }));

    const caio = combatUpdatedDto.parse(await eventPayload(table.caio, 'combat:updated'));
    expect(caio.combat.combatants.map(({ tokenIds }) => tokenIds)).toEqual([[table.kaelId]]);
    const ana = combatUpdatedDto.parse(await eventPayload(table.ana, 'combat:updated'));
    expect(ana.combat.combatants.map(({ tokenIds }) => [...tokenIds].sort())).toEqual([
      [table.kaelId, table.loboId].sort(),
    ]);
    expectNoTrace(table.caio, table.loboId);
  });

  it('the snapshot of Caio during the combat has the turn of the Lobo as nobody on the turn', async () => {
    const table = await hiddenTable(live);
    await startCombat(table);
    const started = (await eventPayload(table.ana, 'combat:started')) as { combat: CombatDto };
    await send(
      table.ana.client,
      'combat:nextTurn',
      on({ fromCombatantId: started.combat.currentCombatantId }),
    );

    const state = await synced(table.caio.client, live.vharn);

    expect(state.combat).toMatchObject({ currentCombatantId: null });
    expect(JSON.stringify(state)).not.toContain(table.loboId);
  });
});
