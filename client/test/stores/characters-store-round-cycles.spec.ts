import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { createCharactersStore, type CharactersStore } from '@/stores/characters-store';
import { VHARN } from '../support/campaigns-api-fake';
import { characterChangedAt, lyraCharacter, tableSynced } from '../support/character-fixtures';
import { moonCycle, roundCyclesChangedAt } from '../support/round-cycle-fixtures';

describe('the round cycles in the table stream', () => {
  let resyncs: number;
  let store: StoreApi<CharactersStore>;

  beforeEach(() => {
    resyncs = 0;
    store = createCharactersStore(VHARN.id, () => {
      resyncs += 1;
    });
  });

  function apply(...updates: Parameters<CharactersStore['apply']>[0][]): void {
    for (const update of updates) store.getState().apply(update);
  }

  function phaseIndexes(): (string | null | undefined)[] {
    return store.getState().roundCycles.map((cycle) => cycle.combats[0]?.currentPhaseId);
  }

  it('starts with no cycle', () => {
    expect(store.getState().roundCycles).toEqual([]);
  });

  it('the sync brings the cycles this viewer sees', () => {
    apply(tableSynced(3, [], [], [moonCycle()]));
    expect(store.getState().roundCycles.map(({ name }) => name)).toEqual(['Fases da Lua']);
  });

  it('cycle:listChanged at the next version replaces the whole list and moves the version', () => {
    apply(
      tableSynced(3, [], [], [moonCycle()]),
      roundCyclesChangedAt(4, [moonCycle({ current: 1 })]),
    );
    expect(store.getState().version).toBe(4);
    expect(phaseIndexes()).toEqual([moonCycle({ current: 1 }).combats[0]?.currentPhaseId]);
  });

  it('cycle:listChanged at the same version as a character:changed still applies (one bump for both)', () => {
    apply(
      tableSynced(3, [lyraCharacter()], [], [moonCycle()]),
      characterChangedAt(4, lyraCharacter()),
      roundCyclesChangedAt(4, [moonCycle({ current: 2 })]),
    );
    expect(store.getState().version).toBe(4);
    expect(phaseIndexes()).toEqual([moonCycle({ current: 2 }).combats[0]?.currentPhaseId]);
    expect(resyncs).toBe(0);
  });

  it('an older cycle:listChanged is a duplicate and changes nothing', () => {
    apply(tableSynced(5, [], [], [moonCycle({ current: 3 })]), roundCyclesChangedAt(4, []));
    expect(store.getState().roundCycles).toHaveLength(1);
  });

  it('a cycle:listChanged past a gap is held and asks the snapshot once', () => {
    apply(tableSynced(3, [], [], []), roundCyclesChangedAt(6, [moonCycle()]));
    expect([store.getState().roundCycles, resyncs]).toEqual([[], 1]);

    apply(tableSynced(5, [], [], []));
    expect(store.getState().roundCycles.map(({ name }) => name)).toEqual(['Fases da Lua']);
  });

  it('an empty list (the cycle left this viewer) empties it', () => {
    apply(tableSynced(3, [], [], [moonCycle()]), roundCyclesChangedAt(4, []));
    expect(store.getState().roundCycles).toEqual([]);
  });
});
