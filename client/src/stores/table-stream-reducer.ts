import type { CharacterDto, ConditionDefinitionDto } from '@lorkarium/contracts';
import {
  holdersShowingDefinition,
  holdersWithoutDefinition,
  withDefinitionReplaced,
  withDefinitionsAdded,
} from '@/lib/condition-catalog';
import type { CharacterUpdate } from '@/services/table-session-api';

/** A versioned event of the table stream: a character's or the condition list's. */
export type TableStreamEvent = Exclude<
  CharacterUpdate,
  Readonly<{ kind: 'characters' | 'charactersFailed' }>
>;

type CharacterEvent = Extract<TableStreamEvent, { kind: 'characterChanged' | 'characterRemoved' }>;

type ListEvent = Exclude<TableStreamEvent, CharacterEvent>;

/** What the table stream holds besides its version: the characters this viewer sees and the
 *  table's condition list. */
export type TableStreamContent = Readonly<{
  characters: readonly CharacterDto[];
  conditionDefinitions: ConditionDefinitionDto[];
}>;

/** The table stream after one event, already checked to be `version + 1`. An edited definition
 *  shows on every character holding it and a deleted one leaves them (the server publishes no
 *  `character:changed` for that); what did not change keeps its identity.
 *
 *  Example: `tableStreamAfter({ characters, conditionDefinitions }, update).characters` */
export function tableStreamAfter(
  { characters, conditionDefinitions }: TableStreamContent,
  update: TableStreamEvent,
): TableStreamContent {
  if (update.kind === 'characterChanged' || update.kind === 'characterRemoved') {
    return { characters: charactersAfter(characters, update), conditionDefinitions };
  }
  return listEventAfter({ characters, conditionDefinitions }, update);
}

function charactersAfter(
  characters: readonly CharacterDto[],
  update: CharacterEvent,
): readonly CharacterDto[] {
  if (update.kind === 'characterChanged')
    return withCharacters(characters, update.event.characters);
  return characters.filter(({ id }) => id !== update.event.characterId);
}

function listEventAfter(content: TableStreamContent, update: ListEvent): TableStreamContent {
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
  { characters, conditionDefinitions }: TableStreamContent,
  conditionId: string,
): TableStreamContent {
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
