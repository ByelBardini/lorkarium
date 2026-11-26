import { CONDITION_ICONS } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { CONDITION_ICON_WORDS } from '@/lib/condition-icon-words';
import { conditionKey } from '@/lib/condition-names';

const words = Object.entries(CONDITION_ICON_WORDS);
const iconNames = CONDITION_ICONS.map((key) => key.slice(key.indexOf(':') + 1)).join(' ');

describe('CONDITION_ICON_WORDS', () => {
  it('holds about 300 Portuguese words, as the search types them: no case, no accent', () => {
    expect(words.length).toBeGreaterThanOrEqual(300);
    expect(words.filter(([word]) => conditionKey(word) !== word).map(([word]) => word)).toEqual([]);
  });

  it('every English word it gives finds at least one icon of the contract', () => {
    const dead = words.flatMap(([word, english]) =>
      english
        .split(' ')
        .filter((term) => !iconNames.includes(term))
        .map((term) => `${word}→${term}`),
    );
    expect(dead).toEqual([]);
  });
});
