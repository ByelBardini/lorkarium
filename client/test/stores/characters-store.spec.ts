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
  conditionDefinedAt,
  definitionDeletedAt,
  definitionUpdatedAt,
  kaelCharacter,
  lyraCharacter,
  tableSynced,
} from '../support/character-fixtures';
import {
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  activeCondition,
  conditionDefinition,
} from '../support/table-session-fixtures';
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

describe('createCharactersStore, the condition list on the table stream', () => {
  const BLINDED_ID = 'f7a8b9c0-d1e2-4f3a-8b5c-6d7e8f901234';
  const blinded = conditionDefinition({ id: BLINDED_ID, name: 'Cego', icon: 'eye-off' });
  const poisonedLyra = lyraCharacter({ conditions: [activeCondition({ remainingRounds: 2 })] });
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

  function listNames(): string[] {
    return store.getState().conditionDefinitions.map(({ name }) => name);
  }

  it('starts with no condition on the list; the sync brings the list with the characters', () => {
    expect(store.getState().conditionDefinitions).toEqual([]);
    apply(tableSynced(3, [lyraCharacter()], [conditionDefinition()]));
    expect(listNames()).toEqual(['Envenenado']);
  });

  it('a condition event and a character event share one version: each is the next of the other', () => {
    apply(tableSynced(3, [lyraCharacter()], []));
    apply(conditionDefinedAt(4, blinded), characterChangedAt(5, lyraCharacter({ armorClass: 17 })));
    expect(store.getState().version).toBe(5);
    expect(listNames()).toEqual(['Cego']);
    expect(store.getState().characters[0]?.armorClass).toBe(17);
    expect(resyncs).toBe(0);
  });

  it('a condition event past a gap left by a character event is held and asks one resync', () => {
    apply(tableSynced(3, [lyraCharacter()], []));
    apply(conditionDefinedAt(5, blinded));
    expect(store.getState()).toMatchObject({ version: 3, resyncAsked: true });
    expect(listNames()).toEqual([]);
    expect(resyncs).toBe(1);
  });

  it('the resync replays a held condition event past its version', () => {
    apply(tableSynced(3, [lyraCharacter()], []));
    apply(conditionDefinedAt(5, blinded));
    apply(tableSynced(4, [lyraCharacter()], [conditionDefinition()]));
    expect(store.getState().version).toBe(5);
    expect(listNames()).toEqual(['Envenenado', 'Cego']);
  });

  it('condition:definitionUpdated changes the look of the condition on the character holding it', () => {
    apply(tableSynced(3, [poisonedLyra, kaelCharacter()], [conditionDefinition()]));
    const kael = store.getState().characters[1];
    apply(definitionUpdatedAt(4, conditionDefinition({ name: 'Nauseado', look: 'unconscious' })));
    const [lyra] = store.getState().characters;
    expect(lyra?.conditions[0]).toMatchObject({ name: 'Nauseado', look: 'unconscious' });
    expect(lyra?.conditions[0]?.remainingRounds).toBe(2);
    expect(store.getState().characters[1]).toBe(kael);
    expect(listNames()).toEqual(['Nauseado']);
  });

  it('condition:definitionDeleted takes the condition off the list and off every character', () => {
    apply(tableSynced(3, [poisonedLyra], [conditionDefinition(), blinded]));
    apply(definitionDeletedAt(4, conditionDefinition().id));
    expect(store.getState().characters[0]?.conditions).toEqual([]);
    expect(listNames()).toEqual(['Cego']);
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
