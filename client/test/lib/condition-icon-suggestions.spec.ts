import { CONDITION_ICONS } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { CONDITION_ICON_SUGGESTIONS, suggestedIconsFor } from '@/lib/condition-icon-suggestions';
import { CONDITION_ICON_LABELS } from '@/lib/condition-icon-labels';

const suggestedKeys = CONDITION_ICON_SUGGESTIONS.flatMap((suggestion) => suggestion.keys);
const suggestionOf = (name: string) =>
  CONDITION_ICON_SUGGESTIONS.find((suggestion) => suggestion.name === name)?.keys;

describe('suggestedIconsFor', () => {
  it('a known condition name gives its curated icons in order, manacles first for Imobilizado', () => {
    const icons = suggestedIconsFor('Imobilizado');
    expect(icons[0]).toBe('game-icons:manacles');
    expect(icons).toEqual(suggestionOf('Imobilizado'));
    expect(icons.length).toBeGreaterThan(5);
  });

  it.each(['caido', 'CAÍDO', '  Caído '])(
    '%s is matched without case, accent or outer spaces',
    (name) => {
      expect(suggestedIconsFor(name)).toEqual(suggestionOf('Caído'));
    },
  );

  it('the start of a name finds the condition it begins', () => {
    expect(suggestedIconsFor('Sangra')).toEqual(suggestionOf('Sangrando'));
  });

  it.each(['', '   '])('a blank name (%j) suggests nothing', (name) => {
    expect(suggestedIconsFor(name)).toEqual([]);
  });

  it('an unknown name suggests nothing', () => {
    expect(suggestedIconsFor('Zzz')).toEqual([]);
  });
});

describe('CONDITION_ICON_SUGGESTIONS', () => {
  it('every suggested key is an icon the contract accepts', () => {
    const accepted = new Set<string>(CONDITION_ICONS);
    expect(suggestedKeys.filter((key) => !accepted.has(key))).toEqual([]);
  });

  it('every suggested key has a name in pt-BR', () => {
    const unnamed = suggestedKeys.filter((key) => !CONDITION_ICON_LABELS[key]?.trim());
    expect(unnamed).toEqual([]);
  });

  it('a condition never repeats an icon in its own list', () => {
    const repeated = CONDITION_ICON_SUGGESTIONS.filter(
      (suggestion) => new Set(suggestion.keys).size !== suggestion.keys.length,
    ).map((suggestion) => suggestion.name);
    expect(repeated).toEqual([]);
  });
});
