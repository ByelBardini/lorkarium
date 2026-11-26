import type { CharacterDto, ConditionDefinitionDto, RoundCycleDto } from '@lorkarium/contracts';
import {
  holdersShowingDefinition,
  holdersWithoutDefinition,
  withDefinitionReplaced,
  withDefinitionsAdded,
} from '@/lib/condition-catalog';
import type { CharacterUpdate } from '@/services/table-session-api';

/** A versioned event of the table stream: a character's, the condition list's or the round
 *  cycles'. */
export type TableStreamEvent = Exclude<
  CharacterUpdate,
  Readonly<{ kind: 'characters' | 'charactersFailed' | 'roundCyclesAnnounced' }>
>;

type CharacterEvent = Extract<TableStreamEvent, { kind: 'characterChanged' | 'characterRemoved' }>;

type ListEvent = Exclude<
  TableStreamEvent,
  CharacterEvent | Readonly<{ kind: 'roundCyclesChanged' }>
>;

/** What the table stream holds besides its version: the characters this viewer sees, the
 *  table's condition list and the round cycles this viewer sees. */
export type TableStreamContent = Readonly<{
  characters: readonly CharacterDto[];
  conditionDefinitions: ConditionDefinitionDto[];
  roundCycles: readonly RoundCycleDto[];
}>;

/** The table stream after one event, already checked to be `version + 1`. An edited definition
 *  shows on every character holding it and a deleted one leaves them (the server publishes no
 *  `character:changed` for that); what did not change keeps its identity.
 *
 *  Example: `tableStreamAfter({ characters, conditionDefinitions }, update).characters` */
export function tableStreamAfter(
  content: TableStreamContent,
  update: TableStreamEvent,
): TableStreamContent {
  // The whole list of that version: it replaces, and an equal version may bring it (the server
  // bumps once when a turn changes a character and the cycles).
  if (update.kind === 'roundCyclesChanged') return { ...content, roundCycles: update.event.cycles };
  if (update.kind === 'characterChanged' || update.kind === 'characterRemoved') {
    return { ...content, characters: charactersAfter(content.characters, update) };
  }
  return { ...content, ...listEventAfter(content, update) };
}

function charactersAfter(
  characters: readonly CharacterDto[],
  update: CharacterEvent,
): readonly CharacterDto[] {
  if (update.kind === 'characterChanged')
    return withCharacters(characters, update.event.characters);
  return characters.filter(({ id }) => id !== update.event.characterId);
}

type ListContent = Omit<TableStreamContent, 'roundCycles'>;

function listEventAfter(content: ListContent, update: ListEvent): ListContent {
  const { characters, conditionDefinitions } = content;
  switch (update.kind) {
    case 'conditionDefined':
      return {
        characters,
        conditionDefinitions: [...conditionDefinitions, update.event.definition],
      };
    case 'conditionDefaultsRestored': {
      const added = withDefinitionsAdded(conditionDefinitions, update.event.definitions);
      return { characters, conditionDefinitions: added };
    }
    case 'conditionDefinitionUpdated': {
      const { definition } = update.event;
      return {
        characters: holdersShowingDefinition(characters, definition),
        conditionDefinitions: withDefinitionReplaced(conditionDefinitions, definition),
      };
    }
    case 'conditionDefinitionDeleted':
      return listWithout(content, update.event.conditionId);
  }
}

function listWithout(
  { characters, conditionDefinitions }: ListContent,
  conditionId: string,
): ListContent {
  return {
    characters: holdersWithoutDefinition(characters, conditionId),
    conditionDefinitions: conditionDefinitions.filter(({ id }) => id !== conditionId),
  };
}

// Each changed character replaces its own in place; one not known yet joins at the end.
function withCharacters(
  characters: readonly CharacterDto[],
  changed: readonly CharacterDto[],
): readonly CharacterDto[] {
  const byId = new Map(changed.map((character) => [character.id, character]));
  const kept = characters.map((character) => byId.get(character.id) ?? character);
  const known = new Set(characters.map(({ id }) => id));
  return [...kept, ...changed.filter(({ id }) => !known.has(id))];
}
