import { describe, expect, it } from 'vitest';
import { coneOf } from '../src/cone.vo';
import { lightRange } from '../src/light.vo';
import { lightLevelAt, lightSource, type LightSource } from '../src/lighting';
import { wall, type DoorState, type Wall, type WallKind } from '../src/wall.vo';

function verticalWallAtX7(kind: WallKind = 'wall', doorState: DoorState | null = null): Wall {
  return wall({
    kind,
    shape: 'line',
    x: 7,
    y: 0,
    width: 0,
    height: 12,
    points: [
      [0, 0],
      [0, 12],
    ],
    doorState,
  });
}

const TORCH: LightSource = { center: { x: 5, y: 5 }, range: lightRange(2, 2), cone: null };

describe('lightLevelAt', () => {
  it.each([
    [6, 'seen', 'at 1, inside bright'],
    [8, 'silhouette', 'at 3, inside dim'],
    [10, 'hidden', 'at 5, past bright + dim'],
  ])('a point at (%s, 5) is %s (%s)', (x, level) => {
    expect(lightLevelAt({ x, y: 5 }, [TORCH], [])).toBe(level);
  });

  it('a point exactly at bright (2 cells) is fully lit', () => {
    expect(lightLevelAt({ x: 7, y: 5 }, [TORCH], [])).toBe('seen');
  });

  it('a point exactly at bright + dim (4 cells) is in half-light', () => {
    expect(lightLevelAt({ x: 5, y: 9 }, [TORCH], [])).toBe('silhouette');
  });

  it.each([
    ['wall', null, 'hidden'],
    ['grate', null, 'silhouette'],
    ['curtain', null, 'hidden'],
    ['door', 'open', 'silhouette'],
    ['door', 'closed', 'hidden'],
  ] as const)(
    'a %s (%s) between the torch and the point leaves it %s',
    (kind, doorState, level) => {
      const walls = [verticalWallAtX7(kind, doorState)];
      expect(lightLevelAt({ x: 8, y: 5 }, [TORCH], walls)).toBe(level);
    },
  );

  it('with one light leaving the point in half-light and another in bright, the best wins', () => {
    const lantern: LightSource = {
      center: { x: 9, y: 5 },
      range: lightRange(1, 0),
      cone: null,
    };
    expect(lightLevelAt({ x: 8, y: 5 }, [TORCH, lantern], [])).toBe('seen');
  });

  it('without any light every point is dark', () => {
    expect(lightLevelAt({ x: 5, y: 5 }, [], [])).toBe('hidden');
  });
});

describe('lightSource', () => {
  const center = { x: 3.5, y: 2.5 };

  it('a token without a light emits nothing', () => {
    expect(lightSource(center, null, true)).toBeNull();
  });

  it('a light that is out emits nothing', () => {
    expect(lightSource(center, lightRange(4, 4), false)).toBeNull();
  });

  it('a lit light shines from the center with its range', () => {
    expect(lightSource(center, lightRange(4, 4), true)).toEqual({
      center: { x: 3.5, y: 2.5 },
      range: { bright: 4, dim: 4 },
      cone: null,
    });
  });
});

describe('lightLevelAt of a lantern (a light in a cone)', () => {
  const holder = { x: 5.5, y: 5.5 };
  const lantern = lightSource(holder, lightRange(6, 0), true, coneOf(0, 60));
  const lights = lantern ? [lantern] : [];

  it('a point ahead, at (9, 5.5), is lit', () => {
    expect(lightLevelAt({ x: 9, y: 5.5 }, lights, [])).toBe('seen');
  });

  it.each([
    ['behind', { x: 2, y: 5.5 }],
    ['beside', { x: 5.5, y: 9 }],
  ])('a point %s the holder is dark', (_, point) => {
    expect(lightLevelAt(point, lights, [])).toBe('hidden');
  });

  it('the apex is lit, so whoever holds the lantern shows', () => {
    expect(lightLevelAt(holder, lights, [])).toBe('seen');
  });

  it('a point exactly on the 30° edge is lit', () => {
    const edge = { x: 5.5 + 3 * Math.cos(Math.PI / 6), y: 5.5 + 3 * Math.sin(Math.PI / 6) };
    expect(lightLevelAt(edge, lights, [])).toBe('seen');
  });

  it('the source keeps its cone', () => {
    expect(lantern?.cone).toEqual({ facing: 0, angle: 60 });
  });
});
