import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import {
  characterOfUser,
  createCharactersStore,
  type CharactersStore,
} from '@/stores/characters-store';
import { QUELM } from '../support/campaigns-api-fake';
import {
  KAEL_CHARACTER_ID,
  LYRA_CHARACTER_ID,
  characterChanged,
  characterChangedAt,
  characterRemovedAt,
  charactersSynced,
  kaelCharacter,
  lyraCharacter,
} from '../support/character-fixtures';
import { BIA_AT_TABLE, CAIO_AT_TABLE } from '../support/table-session-fixtures';
import { VHARN } from '../support/campaigns-api-fake';

describe('createCharactersStore', () => {
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

  function names(): string[] {
    return store.getState().characters.map(({ name }) => name);
  }

  it('starts loading, with no version and no characters', () => {
    expect(store.getState()).toMatchObject({ status: 'loading', version: null, characters: [] });
  });

  it('a sync replaces the characters and sets the version', () => {
    apply(charactersSynced(3, lyraCharacter()));
    expect(store.getState()).toMatchObject({ status: 'ready', version: 3 });
    expect(names()).toEqual(['Lyra']);
  });

  it('character:changed at the next version replaces the character in place and moves the version', () => {
    apply(charactersSynced(3, lyraCharacter(), kaelCharacter()));
    apply(characterChangedAt(4, lyraCharacter({ armorClass: 17 })));
    expect(store.getState().version).toBe(4);
    expect(store.getState().characters[0]?.armorClass).toBe(17);
    expect(names()).toEqual(['Lyra', 'Kael']);
  });

  it('every character of one change lands in one version; an unknown one comes in at the end', () => {
    apply(charactersSynced(3, lyraCharacter()));
    apply(characterChangedAt(4, kaelCharacter(), lyraCharacter({ name: 'Lyra Vandel' })));
    expect(store.getState().version).toBe(4);
    expect(names()).toEqual(['Lyra Vandel', 'Kael']);
  });

  it('character:removed at the next version takes the character away', () => {
    apply(charactersSynced(3, lyraCharacter(), kaelCharacter()));
    apply(characterRemovedAt(4, LYRA_CHARACTER_ID));
    expect(names()).toEqual(['Kael']);
    expect(store.getState().version).toBe(4);
  });

  it('an event at or below the version is a duplicate and changes nothing', () => {
    apply(charactersSynced(3, lyraCharacter()));
    const before = store.getState().characters;
    apply(characterChangedAt(3, lyraCharacter({ armorClass: 1 })));
    expect(store.getState().characters).toBe(before);
    expect(resyncs).toBe(0);
  });

  it('a gap holds the event and asks one resync, even with more events past it', () => {
    apply(charactersSynced(3, lyraCharacter()));
    apply(characterChangedAt(5, lyraCharacter({ armorClass: 1 })));
    apply(characterChangedAt(6, lyraCharacter({ armorClass: 2 })));
    expect(resyncs).toBe(1);
    expect(store.getState().characters[0]?.armorClass).toBe(15);
  });

  it('the resync replays the held events past its version, in order', () => {
    apply(charactersSynced(3, lyraCharacter()));
    apply(characterChangedAt(6, lyraCharacter({ armorClass: 6 })));
    apply(characterChangedAt(5, lyraCharacter({ armorClass: 5 })));
    apply(charactersSynced(4, lyraCharacter({ armorClass: 4 })));
    expect(store.getState()).toMatchObject({ version: 6, held: [], resyncAsked: false });
    expect(store.getState().characters[0]?.armorClass).toBe(6);
  });

  it('events before the first sync wait for it; the ones it already holds are dropped', () => {
    apply(characterChangedAt(3, lyraCharacter({ armorClass: 3 })));
    apply(characterRemovedAt(5, KAEL_CHARACTER_ID));
    expect(resyncs).toBe(0);
    apply(charactersSynced(4, lyraCharacter({ armorClass: 4 }), kaelCharacter()));
    expect(store.getState().version).toBe(5);
    expect(store.getState().characters.map(({ armorClass }) => armorClass)).toEqual([4]);
  });

  it("another table's event changes nothing", () => {
    apply(charactersSynced(3, lyraCharacter()));
    const event = {
      ...characterChanged(4, lyraCharacter({ armorClass: 1 })),
      campaignId: QUELM.id,
    };
    apply({ kind: 'characterChanged', event });
    expect(store.getState().version).toBe(3);
  });

  it('a first sync that fails fails; a failed resync keeps the characters shown', () => {
    apply({ kind: 'charactersFailed', failure: 'offline' });
    expect(store.getState()).toMatchObject({ status: 'failed', failure: 'offline' });
    apply(charactersSynced(3, lyraCharacter()));
    apply(characterChangedAt(5, lyraCharacter()));
    apply({ kind: 'charactersFailed', failure: 'unexpected' });
    expect(store.getState()).toMatchObject({ status: 'ready', resyncAsked: false });
    expect(names()).toEqual(['Lyra']);
  });

  it('resync asks the snapshot even with one on its way', () => {
    apply(charactersSynced(3, lyraCharacter()));
    apply(characterChangedAt(5, lyraCharacter()));
    store.getState().resync();
    expect(resyncs).toBe(2);
  });
});

describe('characterOfUser', () => {
  it("finds a member's character, and none for who has no character here", () => {
    const characters = [lyraCharacter(), kaelCharacter(), lyraCharacter({ id: 'x', userId: null })];
    expect(characterOfUser(characters, BIA_AT_TABLE.userId)?.name).toBe('Lyra');
    expect(characterOfUser(characters, CAIO_AT_TABLE.userId)?.name).toBe('Kael');
    expect(characterOfUser(characters, 'c0ffee00-0000-4000-8000-000000000001')).toBeNull();
  });
});
