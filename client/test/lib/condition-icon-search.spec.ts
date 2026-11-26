import { describe, expect, it } from 'vitest';
import {
  conditionIconLibraryOf,
  iconsOfLibrary,
  searchConditionIcons,
} from '@/lib/condition-icon-search';

const KEYS = [
  'skull',
  'eye-off',
  'game-icons:fire',
  'game-icons:burning-embers',
  'game-icons:crossed-chains',
  'game-icons:manacles',
  'game-icons:eye-target',
  'game-icons:half-heart',
  'tabler:flame',
  'tabler:eye-off',
  'ph:heart',
  'mdi:paw',
  'lucide:hand-grab',
] as const;

describe('searchConditionIcons', () => {
  it('a Portuguese word finds the icons named by its English translation', () => {
    const found = searchConditionIcons(KEYS, 'fogo');
    expect(found).toContain('game-icons:fire');
    expect(found).toContain('game-icons:burning-embers');
    expect(found).not.toContain('skull');
  });

  it('an English word finds the icons whose name holds it', () => {
    expect(searchConditionIcons(KEYS, 'chain')).toEqual(['game-icons:crossed-chains']);
  });

  it('the pt-BR name of a curated icon is searched too', () => {
    expect(searchConditionIcons(KEYS, 'algemas')).toEqual(['game-icons:manacles']);
  });

  it('two words give the icons of either one, in the list order', () => {
    const found = searchConditionIcons(KEYS, 'olho fogo');
    expect(found).toEqual(KEYS.filter((key) => /eye|fire|burn|flame/.test(key)));
  });

  it('a word without its accent finds the same as with it', () => {
    const accented = searchConditionIcons(KEYS, 'coração');
    expect(accented).toContain('ph:heart');
    expect(searchConditionIcons(KEYS, 'coracao')).toEqual(accented);
  });

  it.each(['', '   '])('a blank query (%j) is the same list, the same array', (query) => {
    expect(searchConditionIcons(KEYS, query)).toBe(KEYS);
  });

  it('a word that matches nothing gives no icon', () => {
    expect(searchConditionIcons(KEYS, 'xyzzy')).toEqual([]);
  });
});

describe('iconsOfLibrary', () => {
  it('a library gives only its own prefixed keys', () => {
    expect(iconsOfLibrary(KEYS, 'tabler')).toEqual(['tabler:flame', 'tabler:eye-off']);
  });

  it('lucide holds the unprefixed keys of before and the prefixed ones', () => {
    expect(iconsOfLibrary(KEYS, 'lucide')).toEqual(['skull', 'eye-off', 'lucide:hand-grab']);
  });

  it('asking twice for the same list and library is the same array', () => {
    const first = iconsOfLibrary(KEYS, 'game-icons');
    const second = iconsOfLibrary(KEYS, 'game-icons');
    expect(second).toBe(first);
    expect(first).toHaveLength(6);
  });
});

describe('conditionIconLibraryOf', () => {
  it.each([
    ['skull', 'lucide'],
    ['game-icons:manacles', 'game-icons'],
    ['mdi:paw', 'mdi'],
  ] as const)('%s belongs to %s', (key, library) => {
    expect(conditionIconLibraryOf(key)).toBe(library);
  });
});
