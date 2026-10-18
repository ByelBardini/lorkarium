import { describe, expect, it } from 'vitest';
import { effectArea, type EffectArea } from '../src/effect-area.vo';
import { reachToward, shiftEffectArea, turnEffectArea } from '../src/effect-area-shaping';

const circle = effectArea({ kind: 'circle', x: 5, y: 5, reach: 2, color: 'ember' });
const smooth = effectArea({ kind: 'smooth_circle', x: 5.23, y: 4.87, reach: 1, color: 'ember' });
const aura = effectArea({
  kind: 'emanation',
  x: 5,
  y: 5,
  width: 1,
  height: 1,
  reach: 1,
  color: 'ember',
});
const sideCone = effectArea({
  kind: 'orthogonal_cone',
  x: 5,
  y: 5.5,
  reach: 3,
  facing: 0,
  color: 'ember',
});
const cornerCone = effectArea({
  kind: 'diagonal_cone',
  x: 5,
  y: 5,
  reach: 3,
  facing: 45,
  color: 'ember',
});

describe('reachToward', () => {
  it('a grid circle reaches the pointer 3.2 cells away as 3 whole cells', () => {
    expect(reachToward(circle, { x: 8.2, y: 5 }, 1)).toBe(3);
  });

  it('a grid circle stays in whole cells even when asked for a free step', () => {
    expect(reachToward(circle, { x: 7.6, y: 5 }, 0)).toBe(3);
  });

  it('a pointer on the origin gives the grid minimum of one cell', () => {
    expect(reachToward(circle, { x: 5, y: 5 }, 1)).toBe(1);
  });

  it('a smooth circle with step 0 follows the pointer to the hundredth', () => {
    expect(reachToward(smooth, { x: 7.5, y: 4.87 }, 0)).toBe(2.27);
  });

  it('a smooth circle with step 0.5 (Shift) snaps to half a cell', () => {
    expect(reachToward(smooth, { x: 7.5, y: 4.87 }, 0.5)).toBe(2.5);
  });

  it('an emanation measures from the footprint, not from its corner', () => {
    expect(reachToward(aura, { x: 8.4, y: 5.5 }, 1)).toBe(2);
  });

  it('a pointer 140 cells away stops at the 100-cell maximum', () => {
    expect(reachToward(circle, { x: 145, y: 5 }, 1)).toBe(100);
  });
});

describe('turnEffectArea', () => {
  it('an orthogonal cone turned to 90 pivots on the center of the cell it leaves', () => {
    expect(turnEffectArea(sideCone, 90)).toEqual({ ...sideCone, x: 4.5, y: 6, facing: 90 });
  });

  it('an orthogonal cone asked for 80 snaps to 90', () => {
    expect(turnEffectArea(sideCone, 80)).toMatchObject({ x: 4.5, y: 6, facing: 90 });
  });

  it('a diagonal cone turned to 135 moves its corner to the bottom left of the same cell', () => {
    expect(turnEffectArea(cornerCone, 135)).toEqual({ ...cornerCone, x: 4, y: 5, facing: 135 });
  });

  it('a diagonal cone asked for 100 snaps to 135', () => {
    expect(turnEffectArea(cornerCone, 100)).toMatchObject({ facing: 135 });
  });

  it('a grid semicircle asked for 170 snaps to 180 and keeps its origin', () => {
    const half = effectArea({
      kind: 'semicircle',
      x: 5,
      y: 5,
      reach: 2,
      facing: 0,
      color: 'ember',
    });
    expect(turnEffectArea(half, 170)).toEqual({ ...half, facing: 180 });
  });

  it.each<[string, EffectArea, number]>([
    ['line', { kind: 'line', x: 2.5, y: 2.5, reach: 3, facing: 0, color: 'ember' }, 30],
    [
      'smooth semicircle',
      { kind: 'smooth_semicircle', x: 5, y: 5, reach: 2, facing: 0, color: 'ember' },
      33,
    ],
  ])('a %s turns freely to %s degrees', (_kind, area, wanted) => {
    expect(turnEffectArea(area, wanted)).toEqual({ ...area, facing: wanted });
  });

  it.each<[string, EffectArea]>([
    ['circle', circle],
    ['emanation', aura],
    ['square', { kind: 'square', x: 2, y: 3, width: 3, height: 2, color: 'ember' }],
  ])('a %s has no facing and comes back unchanged', (_kind, area) => {
    expect(turnEffectArea(area, 90)).toEqual(area);
  });
});

describe('shiftEffectArea', () => {
  it('a grid cone moves whole cells and keeps its origin on the middle of a cell side', () => {
    expect(shiftEffectArea(sideCone, 1.4, -0.6)).toEqual({ ...sideCone, x: 6, y: 4.5 });
  });

  it('a smooth circle moves the exact delta to the hundredth', () => {
    expect(shiftEffectArea(smooth, 0.333, 0)).toEqual({ ...smooth, x: 5.56, y: 4.87 });
  });

  it('an emanation carries its footprint along', () => {
    expect(shiftEffectArea(aura, 2, -1)).toEqual({ ...aura, x: 7, y: 4 });
  });

  it('a shift before the scene origin is refused citing the origin', () => {
    expect(() => shiftEffectArea(circle, -6, 0)).toThrow(/origin \(-1, 5\)/);
  });
});
