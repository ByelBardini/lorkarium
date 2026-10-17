import type { ConditionDefinitionDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { conditionKey, conditionSuggestions, findConditionByName } from '@/lib/condition-names';

const DEFINITIONS: readonly ConditionDefinitionDto[] = [
  { id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', name: 'Envenenado', tone: 'harm' },
  { id: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e', name: 'Caído', tone: 'harm' },
  { id: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f', name: 'Abençoado', tone: 'benefit' },
  { id: 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a', name: 'Cego', tone: 'harm' },
];

describe('conditionKey', () => {
  it('drops case, accents and the outer spaces', () => {
    expect(conditionKey('  Caído ')).toBe('caido');
  });
});

describe('findConditionByName', () => {
  it.each(['caido', 'CAÍDO', ' Caído '])('"%s" finds Caído', (typed) => {
    expect(findConditionByName(DEFINITIONS, typed)?.name).toBe('Caído');
  });

  it('a name not on the list is new', () => {
    expect(findConditionByName(DEFINITIONS, 'Sangrando')).toBeUndefined();
  });

  it('a blank name finds nothing', () => {
    expect(findConditionByName(DEFINITIONS, '   ')).toBeUndefined();
  });
});

describe('conditionSuggestions', () => {
  const names = (typed: string): string[] =>
    conditionSuggestions(DEFINITIONS, typed).map(({ name }) => name);

  it('nothing typed lists all by name', () => {
    expect(names('')).toEqual(['Abençoado', 'Caído', 'Cego', 'Envenenado']);
  });

  it('the ones starting with the text come before the ones containing it', () => {
    expect(names('c')).toEqual(['Caído', 'Cego', 'Abençoado']);
  });

  it('matches without the accent', () => {
    expect(names('abenc')).toEqual(['Abençoado']);
  });

  it('nothing fits: empty', () => {
    expect(names('zzz')).toEqual([]);
  });
});
