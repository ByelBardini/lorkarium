import { describe, expect, it } from 'vitest';
import { CONDITION_ICONS_VERSION } from '@/lib/condition-icon-version';
import {
  conditionIconFileOf,
  conditionIconLabelOf,
  conditionIconUrlOf,
} from '@/lib/condition-icons';

describe('conditionIconFileOf', () => {
  it.each([
    ['skull', 'lucide/skull.svg'],
    ['game-icons:manacles', 'game-icons/manacles.svg'],
    ['tabler:lock-square-rounded', 'tabler/lock-square-rounded.svg'],
  ] as const)('%s is the file %s', (key, file) => {
    expect(conditionIconFileOf(key)).toBe(file);
  });
});

describe('conditionIconUrlOf', () => {
  it('an icon of before is served from the lucide folder of the current version', () => {
    expect(conditionIconUrlOf('skull')).toBe(
      `/condition-icons/${CONDITION_ICONS_VERSION}/lucide/skull.svg`,
    );
  });

  it('a Game-icon is served from its own folder', () => {
    expect(conditionIconUrlOf('game-icons:manacles')).toBe(
      `/condition-icons/${CONDITION_ICONS_VERSION}/game-icons/manacles.svg`,
    );
  });
});

describe('conditionIconLabelOf', () => {
  it.each([
    ['skull', 'Caveira'],
    ['game-icons:manacles', 'Algemas'],
  ] as const)('%s is named %s in pt-BR', (key, label) => {
    expect(conditionIconLabelOf(key)).toBe(label);
  });

  it('an icon without a pt-BR name reads its English key', () => {
    expect(conditionIconLabelOf('game-icons:abbot-meeple')).toBe('Abbot meeple');
  });
});
