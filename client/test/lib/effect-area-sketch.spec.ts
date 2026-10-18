import type { EffectAreaKindDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { effectAreaSketchOf, type AreaFootprint } from '@/lib/effect-area-sketch';

const LYRA: AreaFootprint = { x: 5, y: 4, width: 1, height: 1 };

function sketch(
  kind: EffectAreaKindDto,
  press: readonly [number, number],
  pointer: readonly [number, number],
  snap = false,
) {
  return effectAreaSketchOf({
    style: { kind, color: 'ember' },
    press: { x: press[0], y: press[1] },
    pointer: { x: pointer[0], y: pointer[1] },
    snap,
    footprints: [LYRA],
  });
}

describe('effectAreaSketchOf — grid shapes', () => {
  it('a circle is born on the nearest intersection and reaches the pointer in whole cells', () => {
    expect(sketch('circle', [5.2, 4.9], [8.1, 5])).toMatchObject({ x: 5, y: 5, reach: 3 });
  });

  it('an orthogonal cone leaves the side of the pressed cell that faces the pointer', () => {
    expect(sketch('orthogonal_cone', [4.4, 5.6], [9, 5.6])).toMatchObject({
      x: 5,
      y: 5.5,
      facing: 0,
      reach: 4,
    });
  });

  it('an orthogonal cone dragged up leaves the middle of the top side', () => {
    expect(sketch('orthogonal_cone', [4.4, 5.6], [4.6, 1])).toMatchObject({
      x: 4.5,
      y: 5,
      facing: 270,
    });
  });

  it('a diagonal cone leaves the corner of the pressed cell that faces the pointer', () => {
    expect(sketch('diagonal_cone', [4.5, 4.5], [7.9, 7.8])).toMatchObject({
      x: 5,
      y: 5,
      facing: 45,
      reach: 4,
    });
  });

  it('a line leaves the center of the pressed cell toward the pointer', () => {
    expect(sketch('line', [2.3, 2.7], [6.4, 2.5])).toMatchObject({
      x: 2.5,
      y: 2.5,
      facing: 0,
      reach: 4,
    });
  });

  it('a semicircle on an intersection snaps its facing to a quarter turn', () => {
    expect(sketch('semicircle', [5.1, 5], [5.4, 8])).toMatchObject({ x: 5, y: 5, facing: 90 });
  });
});

describe('effectAreaSketchOf — square and emanation', () => {
  it('a square from (2.2; 3.1) to (5.4; 4.2) is 3 × 3 from (2, 3): the longer side wins', () => {
    expect(sketch('square', [2.2, 3.1], [5.4, 4.2])).toEqual({
      kind: 'square',
      x: 2,
      y: 3,
      width: 3,
      height: 3,
      color: 'ember',
    });
  });

  it('a square dragged farther down than across takes the vertical side', () => {
    expect(sketch('square', [2, 3], [3.2, 7.4])).toMatchObject({ x: 2, y: 3, width: 4, height: 4 });
  });

  it('a square dragged up and left keeps the pressed corner and grows toward the pointer', () => {
    expect(sketch('square', [5, 5], [2.6, 3.1])).toMatchObject({ x: 3, y: 3, width: 2, height: 2 });
  });

  it('an emanation pressed on Lyra wraps her footprint and reaches the pointer from its edge', () => {
    expect(sketch('emanation', [5.5, 4.5], [8.3, 4.5])).toEqual({
      kind: 'emanation',
      x: 5,
      y: 4,
      width: 1,
      height: 1,
      reach: 2,
      color: 'ember',
    });
  });

  it('an emanation pressed on the empty board makes nothing', () => {
    expect(sketch('emanation', [12.5, 9.5], [15, 9.5])).toBeNull();
  });
});

describe('effectAreaSketchOf — smooth shapes and the short drag', () => {
  it('a smooth circle is born where pressed, to the hundredth, and reaches the pointer freely', () => {
    expect(sketch('smooth_circle', [5.23, 4.87], [7.5, 4.87])).toMatchObject({
      x: 5.23,
      y: 4.87,
      reach: 2.27,
    });
  });

  it('with Shift a smooth circle snaps its center and its reach to half a cell', () => {
    expect(sketch('smooth_circle', [5.23, 4.87], [7.5, 4.87], true)).toMatchObject({
      x: 5,
      y: 5,
      reach: 2.5,
    });
  });

  it('a smooth semicircle turns freely toward the pointer, Shift snapping to 45°', () => {
    expect(sketch('smooth_semicircle', [5, 5], [8, 6])).toMatchObject({ facing: 18 });
    expect(sketch('smooth_semicircle', [5, 5], [8, 6], true)).toMatchObject({ facing: 0 });
  });

  it('a drag under half a cell makes nothing', () => {
    expect(sketch('circle', [5, 5], [5.3, 5.2])).toBeNull();
  });
});
