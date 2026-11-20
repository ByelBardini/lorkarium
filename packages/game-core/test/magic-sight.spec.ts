import { describe, expect, it } from 'vitest';
import { lightRange } from '../src/light.vo';
import { lightSource, type LightSource } from '../src/lighting';
import { magicSightRange, magicSightLevel } from '../src/magic-sight';
import { eyeOf, sightRange, type Eye, type SightContext, type SightMode } from '../src/token-sight';
import { wall, type DoorState, type Wall, type WallKind } from '../src/wall.vo';

function lineWall(
  from: [number, number],
  to: [number, number],
  kind: WallKind = 'wall',
  doorState: DoorState | null = null,
): Wall {
  const x = Math.min(from[0], to[0]);
  const y = Math.min(from[1], to[1]);
  return wall({
    kind,
    shape: 'line',
    x,
    y,
    width: Math.abs(to[0] - from[0]),
    height: Math.abs(to[1] - from[1]),
    points: [
      [from[0] - x, from[1] - y],
      [to[0] - x, to[1] - y],
    ],
    doorState,
  });
}

// The mage stands in (0, 5); the scene is lit in daylight unless a case says otherwise.
const MAGE_EYE: Eye = eyeOf({ x: 0.5, y: 5.5 }, null);
const DARKVISION_EYE: Eye = eyeOf({ x: 0.5, y: 5.5 }, sightRange(10, 0));

function context(
  mode: SightMode = 'daylight',
  walls: Wall[] = [],
  lights: LightSource[] = [],
): SightContext {
  return { eyes: [MAGE_EYE], walls, mode, lights };
}

function targetAt(col: number, row: number, side = 1) {
  return { box: { x: col, y: row, width: side, height: side }, scenery: false };
}

describe('magicSightLevel', () => {
  it('reaches a wolf 4 cells away with range 6, no wall between, by daylight', () => {
    expect(magicSightLevel(context(), MAGE_EYE, 6, targetAt(4, 5))).toBe('seen');
  });

  it('counts the edge of the footprint: exactly 6 cells away reaches, 6.01 does not', () => {
    // The eye is at x 0.5; a box starting at x 6.5 has its edge 6 cells away.
    expect(magicSightLevel(context(), MAGE_EYE, 6, targetAt(6.5, 5))).toBe('seen');
    expect(magicSightLevel(context(), MAGE_EYE, 6, targetAt(6.51, 5))).toBe('hidden');
  });

  it('range 0 reaches only a target the eye stands against or inside', () => {
    expect(magicSightLevel(context(), MAGE_EYE, 0, targetAt(0.5, 5))).toBe('seen');
    expect(magicSightLevel(context(), MAGE_EYE, 0, targetAt(1, 5))).toBe('hidden');
  });

  it('a wall that blocks sight between them hides the target', () => {
    const between = lineWall([2, 0], [2, 10]);
    expect(magicSightLevel(context('daylight', [between]), MAGE_EYE, 6, targetAt(4, 5))).toBe(
      'hidden',
    );
  });

  it('an open door does not hide the target', () => {
    const door = lineWall([2, 0], [2, 10], 'door', 'open');
    expect(magicSightLevel(context('daylight', [door]), MAGE_EYE, 6, targetAt(4, 5))).toBe('seen');
  });

  it('a large target with one probe seen past the corner of a wall is reached', () => {
    // The wall hides the center and the upper probes; the lower-right corner shows below it.
    const corner = lineWall([2, 0], [2, 6]);
    expect(magicSightLevel(context('daylight', [corner]), MAGE_EYE, 8, targetAt(3, 5, 2))).toBe(
      'seen',
    );
  });

  it('in range in dim light it is a silhouette, as a visible token there would be', () => {
    const lantern = lightSource({ x: 4.5, y: 8.5 }, lightRange(0, 6), true);
    const dark = context('dark', [], lantern ? [lantern] : []);
    expect(magicSightLevel(dark, MAGE_EYE, 6, targetAt(4, 5))).toBe('silhouette');
  });

  it('in range in dim light an object of the Background layer is seen whole, as scenery', () => {
    const lantern = lightSource({ x: 4.5, y: 8.5 }, lightRange(0, 6), true);
    const dark = context('dark', [], lantern ? [lantern] : []);
    const chest = { ...targetAt(4, 5), scenery: true };
    expect(magicSightLevel(dark, MAGE_EYE, 6, chest)).toBe('seen');
  });

  it('in the penumbra of its own darkvision it is a silhouette too', () => {
    const dim = eyeOf({ x: 0.5, y: 5.5 }, sightRange(1, 6));
    const dark: SightContext = { ...context('dark'), eyes: [dim] };
    expect(magicSightLevel(dark, dim, 6, targetAt(4, 5))).toBe('silhouette');
  });

  it('in range in the dark without darkvision it is not reached', () => {
    expect(magicSightLevel(context('dark'), MAGE_EYE, 6, targetAt(4, 5))).toBe('hidden');
  });

  it('in range in the dark with darkvision of the same eye it is reached', () => {
    const dark: SightContext = { ...context('dark'), eyes: [DARKVISION_EYE] };
    expect(magicSightLevel(dark, DARKVISION_EYE, 6, targetAt(4, 5))).toBe('seen');
  });

  it('with sight off only the range and the walls decide', () => {
    const between = lineWall([2, 0], [2, 10]);
    expect(magicSightLevel(context('off'), MAGE_EYE, 6, targetAt(4, 5))).toBe('seen');
    expect(magicSightLevel(context('off'), MAGE_EYE, 3, targetAt(4, 5))).toBe('hidden');
    expect(magicSightLevel(context('off', [between]), MAGE_EYE, 6, targetAt(4, 5))).toBe('hidden');
  });

  it('uses the level of the same eye: another eye that sees the target does not help', () => {
    // The fighter with darkvision stands next to the wolf; the mage (magic sight) is far and blind.
    const fighter = eyeOf({ x: 5.5, y: 5.5 }, sightRange(10, 0));
    const dark: SightContext = { ...context('dark'), eyes: [MAGE_EYE, fighter] };
    expect(magicSightLevel(dark, MAGE_EYE, 6, targetAt(4, 5))).toBe('hidden');
  });
});

describe('magicSightRange', () => {
  it('keeps 0, 6 and 100 cells', () => {
    expect([0, 6, 100].map(magicSightRange)).toEqual([0, 6, 100]);
  });

  it.each([
    [-1, '-1'],
    [Number.NaN, 'NaN'],
    [101, '101'],
  ])('refuses %s citing the value and the expected shape', (value, shown) => {
    expect(() => magicSightRange(value)).toThrow(RangeError);
    expect(() => magicSightRange(value)).toThrow(
      `Magic sight range ${shown} is invalid: expected a number from 0 to 100 cells.`,
    );
  });
});
