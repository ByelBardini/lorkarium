import type { CharacterDto, ConditionDefinitionDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import type { CharacterUpdate } from '@/services/table-session-api';
import { tableStreamAfter, type TableStreamEvent } from '@/stores/table-stream-reducer';
import {
  KAEL_CHARACTER_ID,
  characterChangedAt,
  characterRemovedAt,
  conditionDefinedAt,
  defaultsRestoredAt,
  definitionDeletedAt,
  definitionUpdatedAt,
  kaelCharacter,
  lyraCharacter,
  lyraPvAt,
} from '../support/character-fixtures';
import { activeCondition, conditionDefinition } from '../support/table-session-fixtures';

const BLINDED_ID = 'f7a8b9c0-d1e2-4f3a-8b5c-6d7e8f901234';
const blinded = conditionDefinition({ id: BLINDED_ID, name: 'Cego', icon: 'eye-off' });
const edited = conditionDefinition({
  name: 'Nauseado',
  tone: 'incapacitating',
  icon: 'skull',
  look: 'unconscious',
  description: 'Desvantagem em ataques.',
});
const NAUSEATED = {
  name: 'Nauseado',
  tone: 'incapacitating',
  icon: 'skull',
  look: 'unconscious',
  description: 'Desvantagem em ataques.',
} as const;

function poisonedFor(remainingRounds: number | null) {
  return activeCondition({ remainingRounds });
}

function eventOf(update: CharacterUpdate): TableStreamEvent {
  if (update.kind === 'characters' || update.kind === 'charactersFailed') {
    throw new Error(`expected a versioned event of the table stream; got ${update.kind}`);
  }
  return update;
}

function after(
  characters: CharacterDto[],
  conditionDefinitions: ConditionDefinitionDto[],
  update: CharacterUpdate,
) {
  return tableStreamAfter({ characters, conditionDefinitions }, eventOf(update));
}

describe('tableStreamAfter, characters', () => {
  it('character:changed replaces a known character in place and appends a new one', () => {
    const next = after([lyraCharacter()], [], characterChangedAt(4, lyraPvAt(18), kaelCharacter()));

    expect(next.characters).toEqual([lyraPvAt(18), kaelCharacter()]);
  });

  it('character:removed takes the character out and keeps the list of conditions', () => {
    const definitions = [conditionDefinition()];
    const next = after(
      [lyraCharacter(), kaelCharacter()],
      definitions,
      characterRemovedAt(4, KAEL_CHARACTER_ID),
    );

    expect(next.characters).toEqual([lyraCharacter()]);
    expect(next.conditionDefinitions).toBe(definitions);
  });
});

describe('tableStreamAfter, the table list of conditions', () => {
  it('condition:defined appends the new definition and keeps the characters', () => {
    const characters = [lyraCharacter()];
    const next = after(characters, [conditionDefinition()], conditionDefinedAt(4, blinded));

    expect(next.conditionDefinitions).toEqual([conditionDefinition(), blinded]);
    expect(next.characters).toBe(characters);
  });

  it('condition:definitionUpdated replaces the definition in the list', () => {
    const next = after([], [blinded, conditionDefinition()], definitionUpdatedAt(4, edited));

    expect(next.conditionDefinitions).toEqual([blinded, edited]);
  });

  it('condition:definitionUpdated shows the edit on every character holding it, keeping the rounds', () => {
    const lyra = lyraCharacter({ conditions: [poisonedFor(2)] });
    const kael = kaelCharacter({ conditions: [poisonedFor(null)] });

    const next = after([lyra, kael], [conditionDefinition()], definitionUpdatedAt(4, edited));

    expect(next.characters.map(({ conditions }) => conditions)).toEqual([
      [{ ...poisonedFor(2), ...NAUSEATED }],
      [{ ...poisonedFor(null), ...NAUSEATED }],
    ]);
  });

  it('condition:definitionUpdated keeps the very characters that do not hold it', () => {
    const lyra = lyraCharacter({ conditions: [poisonedFor(2)] });
    const kael = kaelCharacter();
    const characters = [lyra, kael];

    const next = after(characters, [conditionDefinition()], definitionUpdatedAt(4, edited));
    const untouched = after([kael], [conditionDefinition()], definitionUpdatedAt(4, edited));

    expect(next.characters[1]).toBe(kael);
    expect(untouched.characters).toEqual([kael]);
    expect(untouched.characters[0]).toBe(kael);
  });

  it('condition:definitionUpdated with a lower max stacks clamps the stacks of every character', () => {
    const stacked = (stacks: number) => activeCondition({ maxStacks: 5, stacks });
    const characters = [
      lyraCharacter({ conditions: [stacked(5)] }),
      kaelCharacter({ conditions: [stacked(1)] }),
    ];

    const next = after(
      characters,
      [conditionDefinition({ maxStacks: 5 })],
      definitionUpdatedAt(4, conditionDefinition({ maxStacks: 2 })),
    );

    expect(next.characters.map(({ conditions }) => conditions[0]?.stacks)).toEqual([2, 1]);
    expect(next.characters.map(({ conditions }) => conditions[0]?.maxStacks)).toEqual([2, 2]);
  });

  it('condition:definitionDeleted takes it off the list and off every character', () => {
    const characters = [
      lyraCharacter({ conditions: [poisonedFor(2)] }),
      kaelCharacter({ conditions: [poisonedFor(1)] }),
    ];

    const next = after(
      characters,
      [conditionDefinition(), blinded],
      definitionDeletedAt(4, conditionDefinition().id),
    );

    expect(next.conditionDefinitions).toEqual([blinded]);
    expect(next.characters.map(({ conditions }) => conditions)).toEqual([[], []]);
  });

  it('condition:defaultsRestored appends the definitions that came back, each once', () => {
    const once = after([], [conditionDefinition()], defaultsRestoredAt(4, blinded));
    const twice = after([], [blinded], defaultsRestoredAt(4, blinded));

    expect(once.conditionDefinitions).toEqual([conditionDefinition(), blinded]);
    expect(twice.conditionDefinitions).toEqual([blinded]);
  });
});
