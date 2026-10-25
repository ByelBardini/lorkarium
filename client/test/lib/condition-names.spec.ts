import type { ConditionDefinitionDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  CONDITION_TONE_GROUPS,
  conditionKey,
  conditionSuggestions,
  findConditionByName,
  missingDefaultNames,
  orderedByTone,
} from '@/lib/condition-names';

const DEFINITIONS: readonly ConditionDefinitionDto[] = [
  {
    id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    name: 'Envenenado',
    tone: 'harm',
    icon: 'skull',
    color: null,
    look: null,
    description: '',
    maxStacks: null,
    imageAssetId: null,
  },
  {
    id: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e',
    name: 'Caído',
    tone: 'harm',
    icon: 'skull',
    color: null,
    look: null,
    description: '',
    maxStacks: null,
    imageAssetId: null,
  },
  {
    id: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
    name: 'Abençoado',
    tone: 'benefit',
    icon: 'sparkles',
    color: null,
    look: null,
    description: '',
    maxStacks: null,
    imageAssetId: null,
  },
  {
    id: 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a',
    name: 'Cego',
    tone: 'harm',
    icon: 'skull',
    color: null,
    look: null,
    description: '',
    maxStacks: null,
    imageAssetId: null,
  },
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

describe('orderedByTone', () => {
  it('puts the benefits first and keeps the order inside each nature', () => {
    const harmA = {
      id: 'a',
      name: 'Caído',
      tone: 'harm',
      icon: 'skull',
      color: null,
      look: null,
      description: '',
      maxStacks: null,
      imageAssetId: null,
    } as const;
    const benefit = {
      id: 'b',
      name: 'Abençoado',
      tone: 'benefit',
      icon: 'sparkles',
      color: null,
      look: null,
      description: '',
      maxStacks: null,
      imageAssetId: null,
    } as const;
    const harmB = {
      id: 'c',
      name: 'Cego',
      tone: 'harm',
      icon: 'eye-off',
      color: null,
      look: null,
      description: '',
      maxStacks: null,
      imageAssetId: null,
    } as const;
    expect(orderedByTone([harmA, benefit, harmB]).map(({ id }) => id)).toEqual(['b', 'a', 'c']);
  });

  it('puts the incapacitating between the benefits and the harms, as the list shows them', () => {
    const harm = {
      id: 'a',
      name: 'Caído',
      tone: 'harm',
      icon: 'skull',
      color: null,
      look: null,
      description: '',
      maxStacks: null,
      imageAssetId: null,
    } as const;
    const stop = {
      id: 'b',
      name: 'Paralisado',
      tone: 'incapacitating',
      icon: 'lock',
      color: null,
      look: null,
      description: '',
      maxStacks: null,
      imageAssetId: null,
    } as const;
    const benefit = {
      id: 'c',
      name: 'Abençoado',
      tone: 'benefit',
      icon: 'sparkles',
      color: null,
      look: null,
      description: '',
      maxStacks: null,
      imageAssetId: null,
    } as const;
    expect(orderedByTone([harm, stop, benefit]).map(({ id }) => id)).toEqual(['c', 'b', 'a']);
  });
});

describe('missingDefaultNames', () => {
  it('lists the defaults the table lacks, in the defaults order', () => {
    expect(missingDefaultNames(DEFINITIONS)).toEqual([
      'Concentrando',
      'Invisível',
      'Agarrado',
      'Amedrontado',
      'Atordoado',
      'Imobilizado',
      'Paralisado',
    ]);
  });

  it('a default listed under another case and accent is not missing', () => {
    const typedAnyWay = DEFINITIONS.map((definition) => ({
      ...definition,
      name: ` ${definition.name.toUpperCase().normalize('NFD').replace(/\p{M}/gu, '')} `,
    }));
    expect(missingDefaultNames(typedAnyWay)).toHaveLength(7);
  });

  it('a default renamed by the master is missing again', () => {
    const renamed = DEFINITIONS.map((definition) =>
      definition.name === 'Cego' ? { ...definition, name: 'Cegueira' } : definition,
    );
    expect(missingDefaultNames(renamed)).toContain('Cego');
  });

  it('an empty list misses all the eleven defaults', () => {
    expect(missingDefaultNames([])).toHaveLength(11);
  });
});

describe('CONDITION_TONE_GROUPS', () => {
  it('names the groups benefits, incapacitating, harms, in that order', () => {
    expect(CONDITION_TONE_GROUPS).toEqual([
      { tone: 'benefit', title: 'Benéficas' },
      { tone: 'incapacitating', title: 'Incapacitantes' },
      { tone: 'harm', title: 'Prejudiciais' },
    ]);
  });
});
