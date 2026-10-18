import { describe, expect, it } from 'vitest';
import { effectArea, effectAreaOriginFits, type EffectArea } from '../src/effect-area.vo';

const SCENE_20_BY_12 = { widthCells: 20, heightCells: 12 };

describe('effectArea — the shapes accepted', () => {
  it('a circle on a grid intersection with a whole reach comes back frozen', () => {
    const area = effectArea({ kind: 'circle', x: 5, y: 5, reach: 3, color: 'ember' });
    expect(area).toEqual({ kind: 'circle', x: 5, y: 5, reach: 3, color: 'ember' });
    expect(Object.isFrozen(area)).toBe(true);
  });

  it.each<[string, EffectArea]>([
    [
      'an orthogonal cone facing right from the middle of a cell side',
      { kind: 'orthogonal_cone', x: 5, y: 5.5, reach: 3, facing: 0, color: 'ember' },
    ],
    [
      'an orthogonal cone facing down from the middle of a cell top',
      { kind: 'orthogonal_cone', x: 4.5, y: 6, reach: 3, facing: 90, color: 'ember' },
    ],
    [
      'a diagonal cone from a cell corner facing 45',
      { kind: 'diagonal_cone', x: 5, y: 5, reach: 2, facing: 45, color: 'steel' },
    ],
    [
      'a line from a cell center at a free angle',
      { kind: 'line', x: 2.5, y: 2.5, reach: 3, facing: 30, color: 'moss' },
    ],
    [
      'an emanation around a 1×1 token',
      { kind: 'emanation', x: 5, y: 4, width: 1, height: 1, reach: 2, color: 'violet' },
    ],
    [
      'a smooth circle centered anywhere to the hundredth',
      { kind: 'smooth_circle', x: 5.23, y: 4.87, reach: 2.27, color: 'gold' },
    ],
    [
      'a square from a grid intersection',
      { kind: 'square', x: 2, y: 3, width: 3, height: 2, color: 'ink' },
    ],
    [
      'a semicircle on an intersection facing up',
      { kind: 'semicircle', x: 5, y: 5, reach: 2, facing: 270, color: 'ember' },
    ],
    [
      'a smooth semicircle at a free angle',
      { kind: 'smooth_semicircle', x: 3.1, y: 2.2, reach: 0.5, facing: 33, color: 'ember' },
    ],
  ])('%s is accepted as is', (_scenario, shape) => {
    expect(effectArea(shape)).toEqual(shape);
  });
});

describe('effectArea — the shapes refused', () => {
  it.each<[string, EffectArea, RegExp]>([
    [
      'a circle off the grid intersection',
      { kind: 'circle', x: 2.5, y: 3, reach: 2, color: 'ember' },
      /circle origin \(2\.5, 3\).*grid intersection/,
    ],
    [
      'an orthogonal cone facing down from the middle of a cell side',
      { kind: 'orthogonal_cone', x: 5, y: 5.5, reach: 2, facing: 90, color: 'ember' },
      /orthogonal_cone origin \(5, 5\.5\).*x on a half cell and y whole/,
    ],
    [
      'a diagonal cone facing straight down',
      { kind: 'diagonal_cone', x: 5, y: 5, reach: 2, facing: 90, color: 'ember' },
      /diagonal_cone facing 90.*45, 135, 225 or 315/,
    ],
    [
      'a grid semicircle facing a diagonal',
      { kind: 'semicircle', x: 5, y: 5, reach: 2, facing: 45, color: 'ember' },
      /semicircle facing 45.*0, 90, 180 or 270/,
    ],
    [
      'a line not from a cell center',
      { kind: 'line', x: 2, y: 2.5, reach: 2, facing: 0, color: 'ember' },
      /line origin \(2, 2\.5\).*cell center/,
    ],
    [
      'a grid shape with reach 0',
      { kind: 'circle', x: 2, y: 2, reach: 0, color: 'ember' },
      /circle reach 0.*whole cells from 1 to 100/,
    ],
    [
      'a grid shape with reach 101',
      { kind: 'circle', x: 2, y: 2, reach: 101, color: 'ember' },
      /circle reach 101.*whole cells from 1 to 100/,
    ],
    [
      'a grid shape with a fractional reach',
      { kind: 'semicircle', x: 2, y: 2, reach: 2.5, facing: 0, color: 'ember' },
      /semicircle reach 2\.5.*whole cells from 1 to 100/,
    ],
    [
      'a smooth shape with a reach under half a cell',
      { kind: 'smooth_circle', x: 2, y: 2, reach: 0.3, color: 'ember' },
      /smooth_circle reach 0\.3.*0\.5 to 100/,
    ],
    [
      'a square with width 0',
      { kind: 'square', x: 2, y: 2, width: 0, height: 2, color: 'ember' },
      /square width 0.*whole cells from 1 to 100/,
    ],
    [
      'an emanation with a side of a quarter cell',
      { kind: 'emanation', x: 5, y: 5, width: 0.25, height: 1, reach: 1, color: 'ember' },
      /emanation width 0\.25.*multiple of 0\.5 from 0\.5 to 10/,
    ],
    [
      'a line facing 360',
      { kind: 'line', x: 2.5, y: 2.5, reach: 2, facing: 360, color: 'ember' },
      /Facing 360/,
    ],
    [
      'a smooth circle with a NaN center',
      { kind: 'smooth_circle', x: Number.NaN, y: 2, reach: 1, color: 'ember' },
      /smooth_circle origin \(NaN, 2\)/,
    ],
  ])('%s is refused citing the value and the expected shape', (_scenario, shape, message) => {
    expect(() => effectArea(shape)).toThrow(RangeError);
    expect(() => effectArea(shape)).toThrow(message);
  });
});

describe('effectAreaOriginFits', () => {
  it('an origin on the far corner of the scene fits (the edge counts)', () => {
    const area = effectArea({ kind: 'circle', x: 20, y: 12, reach: 2, color: 'ember' });
    expect(effectAreaOriginFits(SCENE_20_BY_12, area)).toBe(true);
  });

  it('an origin half a cell past the right edge does not fit', () => {
    const area = effectArea({ kind: 'smooth_circle', x: 20.5, y: 3, reach: 2, color: 'ember' });
    expect(effectAreaOriginFits(SCENE_20_BY_12, area)).toBe(false);
  });

  it('a square spilling past the scene still fits: only its origin counts', () => {
    const area = effectArea({ kind: 'square', x: 18, y: 10, width: 4, height: 4, color: 'ember' });
    expect(effectAreaOriginFits(SCENE_20_BY_12, area)).toBe(true);
  });
});
