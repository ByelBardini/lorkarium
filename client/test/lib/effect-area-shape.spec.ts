import { describe, expect, it } from 'vitest';
import { sameEffectAreaShape, sentShapeOf, shapeOfEffectArea } from '@/lib/effect-area-shape';
import { effectAreaKindLabel } from '@/lib/effect-area-style';
import { anaCircle, biaCone } from '../support/effect-area-fixtures';

describe('shapeOfEffectArea', () => {
  it('a confirmed cone loses its id and author and keeps the fields of a cone', () => {
    expect(shapeOfEffectArea(biaCone())).toEqual({
      kind: 'diagonal_cone',
      x: 6,
      y: 6,
      reach: 3,
      facing: 45,
      color: 'ember',
    });
  });

  it('a confirmed circle carries no facing', () => {
    expect(shapeOfEffectArea(anaCircle())).toEqual({
      kind: 'circle',
      x: 10,
      y: 5,
      reach: 2,
      color: 'moss',
    });
  });
});

describe('sentShapeOf', () => {
  it('a game-core shape goes back with the color it is given', () => {
    const moved = { kind: 'circle', x: 11, y: 5, reach: 2, color: 'whatever' } as const;
    expect(sentShapeOf(moved, 'moss')).toEqual({
      kind: 'circle',
      x: 11,
      y: 5,
      reach: 2,
      color: 'moss',
    });
  });
});

describe('sameEffectAreaShape', () => {
  it('two shapes equal to the hundredth are the same', () => {
    const circle = shapeOfEffectArea(anaCircle({ kind: 'smooth_circle', x: 5.23 }));
    expect(sameEffectAreaShape(circle, { ...circle, x: 5.2300001 })).toBe(true);
  });

  it('a different reach is another shape', () => {
    const cone = shapeOfEffectArea(biaCone());
    expect(sameEffectAreaShape(cone, shapeOfEffectArea(biaCone({ reach: 4 })))).toBe(false);
  });
});

describe('effectAreaKindLabel', () => {
  it('each shape has its name in pt-BR', () => {
    expect(effectAreaKindLabel('orthogonal_cone')).toBe('Cone horizontal');
    expect(effectAreaKindLabel('smooth_semicircle')).toBe('Semicírculo perfeito');
  });
});
