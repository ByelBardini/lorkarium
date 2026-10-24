import { describe, expect, it } from 'vitest';
import {
  tokensOverCatalog,
  tokensShowingDefinition,
  tokensWithoutDefinition,
  withDefinitionReplaced,
  withDefinitionsAdded,
} from '@/lib/condition-catalog';
import { linkedLyra } from '../support/cast-fixtures';
import {
  activeCondition,
  conditionDefinition,
  kael,
  lyra,
} from '../support/table-session-fixtures';

const BLESSED_ID = 'e6f7a8b9-c0d1-4e2f-9a4b-5c6d7e8f9012';
const BLINDED_ID = 'f7a8b9c0-d1e2-4f3a-8b5c-6d7e8f901234';
const poisoned = conditionDefinition();
const blessed = conditionDefinition({
  id: BLESSED_ID,
  name: 'Abençoado',
  tone: 'benefit',
  icon: 'sparkles',
});
const blinded = conditionDefinition({ id: BLINDED_ID, name: 'Cego', icon: 'eye-off' });
// Envenenado as the master saved it in the settings: every shown field changed.
const sickened = conditionDefinition({
  name: 'Nauseado',
  tone: 'incapacitating',
  icon: 'skull',
  look: 'unconscious',
  description: 'Desvantagem em ataques.',
});

const poisonedOn = (remainingRounds: number | null) =>
  activeCondition({ id: 'a1a2a3a4-b5b6-4c7c-8d8d-9e9e0f0f1a1a', remainingRounds });
const blessedOn = () =>
  activeCondition({
    id: 'b1b2b3b4-c5c6-4d7d-8e8e-9f9f0a0a1b1b',
    conditionId: BLESSED_ID,
    name: 'Abençoado',
    tone: 'benefit',
    icon: 'sparkles',
    remainingRounds: null,
  });

describe('withDefinitionReplaced', () => {
  it('replaces the definition where it stands in the list', () => {
    const list = withDefinitionReplaced([blessed, poisoned, blinded], sickened);
    expect(list.map(({ name }) => name)).toEqual(['Abençoado', 'Nauseado', 'Cego']);
  });

  it('an unknown definition leaves the list as it was', () => {
    expect(withDefinitionReplaced([blessed], sickened)).toEqual([blessed]);
  });
});

describe('withDefinitionsAdded', () => {
  it('appends the restored definitions after the ones the table has', () => {
    const list = withDefinitionsAdded([blessed], [poisoned, blinded]);
    expect(list.map(({ id }) => id)).toEqual([BLESSED_ID, poisoned.id, BLINDED_ID]);
  });

  it('the same restoration arriving twice adds each definition once', () => {
    const once = withDefinitionsAdded([blessed], [blinded]);
    expect(withDefinitionsAdded(once, [blinded]).map(({ id }) => id)).toEqual([
      BLESSED_ID,
      BLINDED_ID,
    ]);
  });
});

describe('tokensShowingDefinition', () => {
  it('every token holding the condition shows the saved name, tone, icon, look and description', () => {
    const tokens = [lyra({ conditions: [poisonedOn(2)] }), kael({ conditions: [poisonedOn(4)] })];
    const shown = tokensShowingDefinition(tokens, sickened);
    expect(shown.map(({ conditions }) => conditions[0])).toEqual([
      expect.objectContaining({
        name: 'Nauseado',
        tone: 'incapacitating',
        icon: 'skull',
        look: 'unconscious',
        description: 'Desvantagem em ataques.',
      }),
      expect.objectContaining({ name: 'Nauseado', description: 'Desvantagem em ataques.' }),
    ]);
  });

  it('an edit of the description alone reaches the tokens', () => {
    const described = conditionDefinition({ description: 'Desvantagem em testes.' });
    const [token] = tokensShowingDefinition([lyra({ conditions: [poisonedOn(2)] })], described);
    expect(token?.conditions[0]?.description).toBe('Desvantagem em testes.');
  });

  it('the rounds left of each token stay as they were', () => {
    const tokens = [
      lyra({ conditions: [poisonedOn(2)] }),
      kael({ conditions: [poisonedOn(null)] }),
    ];
    const shown = tokensShowingDefinition(tokens, sickened);
    expect(shown.map(({ conditions }) => conditions[0]?.remainingRounds)).toEqual([2, null]);
  });

  it('the other conditions of the token stay untouched', () => {
    const other = blessedOn();
    const [token] = tokensShowingDefinition(
      [lyra({ conditions: [other, poisonedOn(2)] })],
      sickened,
    );
    expect(token?.conditions[0]).toBe(other);
  });

  it('a token without the condition stays the same object', () => {
    const untouched = kael({ conditions: [blessedOn()] });
    const shown = tokensShowingDefinition(
      [lyra({ conditions: [poisonedOn(2)] }), untouched],
      sickened,
    );
    expect(shown[1]).toBe(untouched);
  });

  it('a definition saved as the tokens already show it keeps each token', () => {
    const token = lyra({ conditions: [poisonedOn(2)] });
    expect(tokensShowingDefinition([token], poisoned)[0]).toBe(token);
  });

  // Regression: the reducer got a new tokens array even with no token changed, against the
  // promise "nothing changed → the same array" (the renderer memoizes by array identity;
  // docs/context/client/performance.md). Found writing these specs, 2026-10-24.
  it('no token holding the condition gives back the same array', () => {
    const tokens = [kael({ conditions: [blessedOn()] })];
    expect(tokensShowingDefinition(tokens, sickened)).toBe(tokens);
  });
});

describe('tokensWithoutDefinition', () => {
  it('takes the condition off every token holding it and keeps their other ones', () => {
    const tokens = [
      lyra({ conditions: [blessedOn(), poisonedOn(2)] }),
      kael({ conditions: [poisonedOn(1)] }),
    ];
    const left = tokensWithoutDefinition(tokens, poisoned.id);
    expect(left.map(({ conditions }) => conditions.map(({ name }) => name))).toEqual([
      ['Abençoado'],
      [],
    ]);
  });

  it('a token without the condition stays the same object', () => {
    const untouched = kael({ conditions: [blessedOn()] });
    expect(tokensWithoutDefinition([untouched], poisoned.id)[0]).toBe(untouched);
  });

  // Regression: same as `tokensShowingDefinition` — a new array with no token changed (2026-10-24).
  it('no token holding the condition gives back the same array', () => {
    const tokens = [kael({ conditions: [blessedOn()] })];
    expect(tokensWithoutDefinition(tokens, poisoned.id)).toBe(tokens);
  });
});

describe('tokensOverCatalog', () => {
  it('a loose token with an edited definition shows it and keeps its rounds', () => {
    const tokens = [kael({ conditions: [poisonedOn(3)] })];
    const [token] = tokensOverCatalog(tokens, [poisoned], [sickened]);
    expect(token?.conditions).toEqual([
      expect.objectContaining({ name: 'Nauseado', look: 'unconscious', remainingRounds: 3 }),
    ]);
  });

  it('a definition the list had before and lacks after leaves the loose tokens', () => {
    const tokens = [kael({ conditions: [blessedOn(), poisonedOn(3)] })];
    const [token] = tokensOverCatalog(tokens, [blessed, poisoned], [blessed]);
    expect(token?.conditions.map(({ name }) => name)).toEqual(['Abençoado']);
  });

  it('a condition the list never had before stays (the list may not have reached it yet)', () => {
    const tokens = [kael({ conditions: [poisonedOn(3)] })];
    expect(tokensOverCatalog(tokens, [blessed], [blessed])).toBe(tokens);
  });

  it('a linked token is left to its anchor', () => {
    const linked = linkedLyra({ conditions: [poisonedOn(3)] });
    const [token] = tokensOverCatalog([linked], [poisoned], []);
    expect(token).toBe(linked);
  });

  it('a list that moved without touching the tokens gives back the same array', () => {
    const tokens = [kael({ conditions: [poisonedOn(3)] })];
    expect(tokensOverCatalog(tokens, [poisoned], [poisoned, blinded])).toBe(tokens);
  });

  it('the same list before and after gives back the same array', () => {
    const tokens = [kael({ conditions: [poisonedOn(3)] })];
    const list = [sickened];
    expect(tokensOverCatalog(tokens, list, list)).toBe(tokens);
  });
});

describe('the stacks of the active conditions after a definition update', () => {
  // Envenenado stacking up to 5, with 5 stacks on Kael.
  const stackingOn = (stacks: number) =>
    activeCondition({ id: 'c1c2c3c4-d5d6-4e7e-8f8f-9a9a0b0b1c1c', maxStacks: 5, stacks });

  it('a lower max stacks copies to the active condition and clamps 5 stacks to 2', () => {
    const [token] = tokensShowingDefinition(
      [kael({ conditions: [stackingOn(5)] })],
      conditionDefinition({ maxStacks: 2 }),
    );
    expect(token?.conditions[0]).toMatchObject({ maxStacks: 2, stacks: 2 });
  });

  it('a definition that no longer stacks leaves the active condition with 1 stack', () => {
    const [token] = tokensShowingDefinition(
      [kael({ conditions: [stackingOn(5)] })],
      conditionDefinition({ maxStacks: null }),
    );
    expect(token?.conditions[0]).toMatchObject({ maxStacks: null, stacks: 1 });
  });

  it('a higher max stacks keeps the stacks the token had', () => {
    const [token] = tokensShowingDefinition(
      [kael({ conditions: [stackingOn(3)] })],
      conditionDefinition({ maxStacks: 9 }),
    );
    expect(token?.conditions[0]).toMatchObject({ maxStacks: 9, stacks: 3 });
  });

  it('a non-stacking condition that starts to stack keeps its single stack', () => {
    const [token] = tokensShowingDefinition(
      [kael({ conditions: [poisonedOn(2)] })],
      conditionDefinition({ maxStacks: 4 }),
    );
    expect(token?.conditions[0]).toMatchObject({ maxStacks: 4, stacks: 1, remainingRounds: 2 });
  });

  it('the same max stacks saved again gives back the same tokens array', () => {
    const tokens = [kael({ conditions: [stackingOn(3)] })];
    expect(tokensShowingDefinition(tokens, conditionDefinition({ maxStacks: 5 }))).toBe(tokens);
  });

  it('a loose token in a grid follows the lower max of the cast list', () => {
    const tokens = [kael({ conditions: [stackingOn(5)] })];
    const before = [conditionDefinition({ maxStacks: 5 })];
    const [token] = tokensOverCatalog(tokens, before, [conditionDefinition({ maxStacks: 2 })]);
    expect(token?.conditions[0]).toMatchObject({ maxStacks: 2, stacks: 2 });
  });
});
