import { effectArea, type EffectArea } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { effectAreaLabel, effectAreaSize } from '@/lib/effect-area-label';

const SCENE = { cellDistance: 1.5, cellUnit: 'm' };

describe('effectAreaLabel', () => {
  it.each<[string, EffectArea, string]>([
    [
      'a circle of reach 4',
      { kind: 'circle', x: 5, y: 5, reach: 4, color: 'gold' },
      'Raio 4 casas · 6 m',
    ],
    [
      'a cone of reach 3',
      { kind: 'diagonal_cone', x: 5, y: 5, reach: 3, facing: 45, color: 'gold' },
      'Cone 3 casas · 4,5 m',
    ],
    [
      'a line of reach 3',
      { kind: 'line', x: 2.5, y: 2.5, reach: 3, facing: 0, color: 'gold' },
      'Linha 3 casas · 4,5 m',
    ],
    [
      'an emanation of reach 2',
      { kind: 'emanation', x: 5, y: 5, width: 1, height: 1, reach: 2, color: 'gold' },
      'Emanação 2 casas · 3 m',
    ],
    [
      'a 3×2 square',
      { kind: 'square', x: 2, y: 3, width: 3, height: 2, color: 'gold' },
      '3 × 2 casas · 4,5 × 3 m',
    ],
    [
      'a smooth circle of reach 2.5',
      { kind: 'smooth_circle', x: 5.2, y: 5, reach: 2.5, color: 'gold' },
      'Raio 2,5 casas · 3,75 m',
    ],
  ])('%s reads "%s"', (_case, area, label) => {
    expect(effectAreaLabel(effectArea(area), SCENE)).toBe(label);
  });

  it('a reach of 1 is one "casa"', () => {
    const one = effectArea({ kind: 'circle', x: 5, y: 5, reach: 1, color: 'gold' });
    expect(effectAreaLabel(one, SCENE)).toBe('Raio 1 casa · 1,5 m');
  });
});

describe('effectAreaSize', () => {
  it('the size reads without the word of the shape', () => {
    const cone = effectArea({
      kind: 'orthogonal_cone',
      x: 5,
      y: 5.5,
      reach: 3,
      facing: 0,
      color: 'gold',
    });
    expect(effectAreaSize(cone, SCENE)).toBe('3 casas · 4,5 m');
  });
});
