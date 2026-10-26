import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import {
  DICE_HISTORY_LIMIT,
  createDiceHistoryStore,
  diceHistoryStorageKey,
  type DiceHistoryEntry,
  type DiceHistoryStore,
} from '@/stores/dice-history-store';
import { QUELM, VHARN } from '../support/campaigns-api-fake';
import { biaRolled, biaRolledSecretly, rollIdOf } from '../support/dice-fixtures';
import { StorageFake } from '../support/storage-fake';
import { biaJoined } from '../support/table-session-fixtures';

const KEY = `lorkarium.dice.${VHARN.id}`;

describe('dice history store', () => {
  let storage: StorageFake;
  let store: StoreApi<DiceHistoryStore>;

  beforeEach(() => {
    storage = new StorageFake();
    store = createDiceHistoryStore({ campaignId: VHARN.id, storage });
  });

  function rolled(n: number) {
    return { kind: 'diceRolled', event: biaRolled({ rollId: rollIdOf(n) }) } as const;
  }

  it('a roll received at 1000 that settles in 2400 enters revealing at 3400', () => {
    store.getState().apply({ kind: 'diceRolled', event: biaRolled() }, 1000);

    expect(store.getState().entries).toEqual([
      { kind: 'rolled', event: biaRolled(), receivedAtMs: 1000, revealAtMs: 3400 },
    ]);
  });

  it('a secret notice enters as secret, revealing after its own settlesInMs', () => {
    store.getState().apply({ kind: 'diceRolledSecretly', event: biaRolledSecretly() }, 1000);

    expect(store.getState().entries).toEqual([
      { kind: 'secret', event: biaRolledSecretly(), receivedAtMs: 1000, revealAtMs: 1800 },
    ]);
  });

  it('the same rollId twice keeps one entry, the first', () => {
    store.getState().apply({ kind: 'diceRolled', event: biaRolled() }, 1000);
    store.getState().apply({ kind: 'diceRolled', event: biaRolled({ total: 3 }) }, 2000);

    expect(store.getState().entries.map((entry) => entry.receivedAtMs)).toEqual([1000]);
  });

  it(`the ${DICE_HISTORY_LIMIT + 1}st roll takes the oldest out`, () => {
    for (let n = 0; n <= DICE_HISTORY_LIMIT; n += 1) store.getState().apply(rolled(n), n);

    const ids = store.getState().entries.map((entry) => entry.event.rollId);
    expect(ids).toHaveLength(200);
    expect(ids[0]).toBe(rollIdOf(1));
    expect(ids.at(-1)).toBe(rollIdOf(200));
  });

  it('an update that is not a roll, or a roll of another table, changes nothing', () => {
    store.getState().apply({ kind: 'memberJoined', event: biaJoined() }, 1000);
    store.getState().apply({ kind: 'diceRolled', event: biaRolled({ campaignId: QUELM.id }) }, 1);

    expect(store.getState().entries).toEqual([]);
    expect(storage.values.has(KEY)).toBe(false);
  });

  it('stores under lorkarium.dice.<campaignId>, and a new store (an F5) reads it back without the throw', () => {
    store.getState().apply({ kind: 'diceRolled', event: biaRolled() }, 1000);
    store
      .getState()
      .apply(
        { kind: 'diceRolledSecretly', event: biaRolledSecretly({ rollId: rollIdOf(1) }) },
        1500,
      );

    expect(diceHistoryStorageKey(VHARN.id)).toBe(KEY);
    const reread = createDiceHistoryStore({ campaignId: VHARN.id, storage }).getState().entries;
    const withoutModels = [
      {
        label: 'Acerto',
        expression: '1d20+5',
        total: 22,
        dice: [{ sides: 20, value: 17, status: 'kept' as const }],
      },
    ];
    expect(reread).toEqual([
      {
        kind: 'rolled',
        event: biaRolled({ throw: null, parts: withoutModels }),
        receivedAtMs: 1000,
        revealAtMs: 3400,
      },
      {
        kind: 'secret',
        event: biaRolledSecretly({ rollId: rollIdOf(1) }),
        receivedAtMs: 1500,
        revealAtMs: 2300,
      },
    ]);
  });

  it.each([
    ['not JSON', '{nope'],
    ['not a list', JSON.stringify({ entries: [] })],
    ['an entry outside the DTO', JSON.stringify([{ kind: 'rolled', event: { total: 1 } }])],
  ])('a stored history that is %s reads as empty', (_case, raw) => {
    storage.values.set(KEY, raw);
    expect(createDiceHistoryStore({ campaignId: VHARN.id, storage }).getState().entries).toEqual(
      [],
    );
  });

  it('a storage that throws starts empty and keeps the rolls in memory', () => {
    const broken = createDiceHistoryStore({ campaignId: VHARN.id, storage: new StorageFake(true) });

    broken.getState().apply({ kind: 'diceRolled', event: biaRolled() }, 1000);

    expect(broken.getState().entries).toHaveLength(1);
  });

  it('clear() empties the history and removes its key', () => {
    store.getState().apply({ kind: 'diceRolled', event: biaRolled() }, 1000);

    store.getState().clear();

    expect(store.getState().entries).toEqual([]);
    expect(storage.values.has(KEY)).toBe(false);
  });

  describe('new entries', () => {
    it('onNewEntry hears each new roll once, with its throw, and not the repeated one', () => {
      const heard: DiceHistoryEntry[] = [];
      store.getState().onNewEntry((entry) => heard.push(entry));

      store.getState().apply({ kind: 'diceRolled', event: biaRolled() }, 1000);
      store.getState().apply({ kind: 'diceRolled', event: biaRolled() }, 1100);

      expect(heard).toEqual([
        { kind: 'rolled', event: biaRolled(), receivedAtMs: 1000, revealAtMs: 3400 },
      ]);
    });

    it('after unsubscribing nothing more is heard', () => {
      const heard: DiceHistoryEntry[] = [];
      const unsubscribe = store.getState().onNewEntry((entry) => heard.push(entry));

      unsubscribe();
      store.getState().apply({ kind: 'diceRolled', event: biaRolled() }, 1000);

      expect(heard).toEqual([]);
    });
  });
});
