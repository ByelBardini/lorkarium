import type { PrepItem } from '@/lib/combat-prep';
import { describe, expect, it } from 'vitest';
import { sceneSectionsOf } from '@/lib/scene-sections';
import { kael, lyra } from '../support/table-session-fixtures';

const bandit = (n: number) => lyra({ id: `b-${n}`, name: `Bandido ${n}`, side: 'enemy' });

function shown(item: PrepItem): string {
  return item.kind === 'group' ? `${item.label} ×${item.tokens.length}` : item.token.name;
}

describe('sceneSectionsOf', () => {
  it('splits by side, counting the tokens: "Grupo · 2", "Inimigos · 7", "Neutros · 1"', () => {
    const tokens = [
      lyra(),
      kael(),
      lyra({ id: 'chefe', name: 'Goblin Chefe', side: 'enemy' }),
      ...[1, 2, 3, 4, 5, 6].map(bandit),
      lyra({ id: 'tav', name: 'Taverneiro', side: 'neutral' }),
    ];

    expect(sceneSectionsOf(tokens).map(({ title, count }) => `${title} · ${count}`)).toEqual([
      'Grupo · 2',
      'Inimigos · 7',
      'Neutros · 1',
    ]);
  });

  it('the same enemy creature is folded in one group, by name; allies are listed one by one', () => {
    const tokens = [
      bandit(2),
      lyra({ id: 'g1', name: 'Guarda 1' }),
      bandit(1),
      lyra({ id: 'g2', name: 'Guarda 2' }),
    ];

    const [grupo, inimigos] = sceneSectionsOf(tokens);

    expect(grupo?.items.map(shown)).toEqual(['Guarda 1', 'Guarda 2']);
    expect(inimigos?.items.map(shown)).toEqual(['Bandido ×2']);
  });

  it('a side without tokens is left out', () => {
    expect(sceneSectionsOf([kael()]).map(({ title }) => title)).toEqual(['Grupo']);
  });

  it('"Bandido 10" comes after "Bandido 2" (numbers in the name are read as numbers)', () => {
    const allies = [lyra({ id: 'x', name: 'Bandido 10' }), lyra({ id: 'y', name: 'Bandido 2' })];

    expect(sceneSectionsOf(allies)[0]?.items.map(shown)).toEqual(['Bandido 2', 'Bandido 10']);
  });
});
