import { describe, expect, it } from 'vitest';
import { lightRange } from '../src/light.vo';
import type { LightSource } from '../src/lighting';
import {
  doorSeenBy,
  eyeFieldOf,
  eyeOf,
  sightLevel,
  sightRange,
  type Eye,
  type SightContext,
  type SightMode,
  type SightRange,
} from '../src/token-sight';
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

const TORCH_EYE: Eye = { center: { x: 5.5, y: 5.5 }, range: sightRange(3, 3), field: null };

function context(
  walls: Wall[] = [],
  mode: SightMode = 'dark',
  eyes = [TORCH_EYE],
  lights: LightSource[] = [],
): SightContext {
  return { eyes, walls, mode, lights };
}

function tokenAt(col: number, row: number, scenery = false, side = 1) {
  return { box: { x: col, y: row, width: side, height: side }, scenery };
}

describe('sightRange', () => {
  it('a bright 12 and dim 4 is kept as sent', () => {
    expect(sightRange(12, 4)).toEqual({ bright: 12, dim: 4 });
  });

  it.each([
    [101, 'bright 101'],
    [-1, 'bright -1'],
    [Number.NaN, 'bright NaN'],
    [Number.POSITIVE_INFINITY, 'bright Infinity'],
  ])('a bright of %s is refused citing the value and 0 to 100 cells', (value, shown) => {
    expect(() => sightRange(value, 0)).toThrow(new RegExp(`${shown}.*0 to 100 cells`));
  });

  it('a dim of 101 is refused citing the dim', () => {
    expect(() => sightRange(0, 101)).toThrow(/dim 101.*0 to 100 cells/);
  });

  // Regression: the reach check shared with light (plan 2026-10-18-iluminacao) keeps "Sight".
  it('a bright of 101 still names sight, not light, in the message', () => {
    expect(() => sightRange(101, 0)).toThrow(
      'Sight bright 101 is invalid: expected 0 to 100 cells.',
    );
  });
});

describe('sightLevel in the dark', () => {
  it.each([
    ['at 2 (inside bright)', 7, 'seen'],
    ['at 5 (inside dim)', 10, 'silhouette'],
    ['at 8 (past dim)', 13, 'hidden'],
  ] as const)('a 1 × 1 token %s is %s', (_name, col, level) => {
    expect(sightLevel(context(), tokenAt(col, 5))).toBe(level);
  });

  it('a token at 2 behind a wall is hidden', () => {
    expect(sightLevel(context([lineWall([6.8, 0], [6.8, 12])]), tokenAt(7, 5))).toBe('hidden');
  });

  it('a token at 2 behind a grate is seen', () => {
    const grate = lineWall([6.8, 0], [6.8, 12], 'grate');
    expect(sightLevel(context([grate]), tokenAt(7, 5))).toBe('seen');
  });

  it('a scenery token inside dim is seen whole, as part of the map', () => {
    expect(sightLevel(context(), tokenAt(10, 5, true))).toBe('seen');
  });

  it('a scenery token past dim is hidden', () => {
    expect(sightLevel(context(), tokenAt(13, 5, true))).toBe('hidden');
  });

  it('with bright 0 and dim 3, a token at 2 is a silhouette', () => {
    const dimOnly = { center: TORCH_EYE.center, range: sightRange(0, 3), field: null };
    expect(sightLevel(context([], 'dark', [dimOnly]), tokenAt(7, 5))).toBe('silhouette');
  });

  it('a 3 × 3 token whose center is behind a corner is seen by an inset corner in view', () => {
    const corner = [lineWall([8, 2], [8, 6.5])];
    const wide = { center: TORCH_EYE.center, range: sightRange(10, 0), field: null };
    expect(sightLevel(context(corner, 'dark', [wide]), tokenAt(8.2, 5.5, false, 3))).toBe('seen');
  });

  it('with two eyes, the one that sees wins', () => {
    const far = { center: { x: 30, y: 30 }, range: sightRange(1, 0), field: null };
    expect(sightLevel(context([], 'dark', [far, TORCH_EYE]), tokenAt(7, 5))).toBe('seen');
  });

  it('without eyes, every token is hidden', () => {
    expect(sightLevel(context([], 'dark', []), tokenAt(7, 5))).toBe('hidden');
  });
});

describe('sightLevel by daylight and off', () => {
  it('by daylight a token 15 cells away in an empty room is seen', () => {
    expect(sightLevel(context([], 'daylight'), tokenAt(20, 5))).toBe('seen');
  });

  it('by daylight a token behind a wall is hidden', () => {
    const between = lineWall([12, 0], [12, 12]);
    expect(sightLevel(context([between], 'daylight'), tokenAt(20, 5))).toBe('hidden');
  });

  it('by daylight an eye without a range still sees', () => {
    const plain = { center: TORCH_EYE.center, range: null, field: null };
    expect(sightLevel(context([], 'daylight', [plain]), tokenAt(20, 5))).toBe('seen');
  });

  it('with vision off every token is seen, even without eyes and behind a wall', () => {
    const between = lineWall([6.8, 0], [6.8, 12]);
    expect(sightLevel(context([between], 'off', []), tokenAt(7, 5))).toBe('seen');
  });
});

describe('doorSeenBy', () => {
  const roomWall = lineWall([7, 0], [7, 5]);
  const roomDoor = lineWall([7, 5], [7, 6], 'door', 'closed');
  const nextDoor = lineWall([10, 5], [10, 6], 'door', 'closed');

  it('the door in the wall of the room, at 2, is seen, though closed it blocks sight', () => {
    expect(doorSeenBy(context([roomWall, roomDoor]), roomDoor)).toBe(true);
  });

  it('the door of the next room, behind another wall, is not seen', () => {
    const walls = [roomWall, roomDoor, lineWall([8, 0], [8, 12]), nextDoor];
    expect(doorSeenBy(context(walls), nextDoor)).toBe(false);
  });

  it('a door past bright + dim is not seen', () => {
    const farDoor = lineWall([14, 5], [14, 6], 'door', 'closed');
    expect(doorSeenBy(context([farDoor]), farDoor)).toBe(false);
  });

  it('by daylight a door 30 cells away with nothing between is seen', () => {
    const farDoor = lineWall([35.5, 5], [35.5, 6], 'door', 'closed');
    expect(doorSeenBy(context([farDoor], 'daylight'), farDoor)).toBe(true);
  });

  it('with vision off any door is seen', () => {
    const walls = [lineWall([8, 0], [8, 12]), nextDoor];
    expect(doorSeenBy(context(walls, 'off', []), nextDoor)).toBe(true);
  });
});

describe('eyeOf', () => {
  it('a token without sight is still an eye, one that sees only what is lit', () => {
    expect(eyeOf({ x: 1, y: 1 }, null)).toEqual({
      center: { x: 1, y: 1 },
      range: null,
      field: null,
    });
  });

  it('a token with sight is an eye with its range', () => {
    expect(eyeOf({ x: 1, y: 1 }, sightRange(2, 1))).toEqual({
      center: { x: 1, y: 1 },
      range: { bright: 2, dim: 1 },
      field: null,
    });
  });
});

describe('sightLevel with light', () => {
  const blindEye: Eye = { center: { x: 2, y: 5 }, range: null, field: null };
  const torch: LightSource = { center: { x: 10, y: 5 }, range: lightRange(2, 2), cone: null };

  function lit(
    walls: Wall[] = [],
    mode: SightMode = 'dark',
    eyes = [blindEye],
    lights = [torch],
  ): SightContext {
    return { eyes, walls, mode, lights };
  }

  it.each([
    ['in the bright light, 8 cells from the eye', 10, 'seen'],
    ['in the half-light', 13, 'silhouette'],
    ['past the light', 16, 'hidden'],
  ] as const)('an ogre %s (column %s) is %s for an eye without range', (_why, col, level) => {
    expect(sightLevel(lit(), tokenAt(col, 5))).toBe(level);
  });

  it('a lit ogre behind a wall between it and the eye, not the torch, is hidden', () => {
    expect(sightLevel(lit([lineWall([6, 0], [6, 12])]), tokenAt(10, 5))).toBe('hidden');
  });

  it('an eye with only dim sight sees an ogre at 4 as a silhouette in the dark', () => {
    const dimEye: Eye = { center: { x: 2.5, y: 5.5 }, range: sightRange(0, 6), field: null };
    expect(sightLevel(lit([], 'dark', [dimEye], []), tokenAt(6, 5))).toBe('silhouette');
  });

  it('the same ogre under a bright torch is seen: the better of sight and light wins', () => {
    const dimEye: Eye = { center: { x: 2.5, y: 5.5 }, range: sightRange(0, 6), field: null };
    const over: LightSource = { center: { x: 6.5, y: 5.5 }, range: lightRange(2, 0), cone: null };
    expect(sightLevel(lit([], 'dark', [dimEye], [over]), tokenAt(6, 5))).toBe('seen');
  });

  it('a scenery token in the half-light of the torch is seen whole', () => {
    expect(sightLevel(lit(), tokenAt(13, 5, true))).toBe('seen');
  });

  it('by daylight, with the torch out, an eye without range sees an ogre in line of sight', () => {
    expect(sightLevel(lit([], 'daylight', [blindEye], []), tokenAt(16, 5))).toBe('seen');
  });

  it('with vision off an unlit ogre is seen', () => {
    expect(sightLevel(lit([], 'off', [blindEye], []), tokenAt(16, 5))).toBe('seen');
  });

  it('in total darkness an eye without range sees nothing, as before lights existed', () => {
    expect(sightLevel(lit([], 'dark', [blindEye], []), tokenAt(3, 5))).toBe('hidden');
  });
});

describe('doorSeenBy with light', () => {
  const cellDoor = lineWall([7, 5], [7, 6], 'door', 'closed');
  const corridorEye: Eye = { center: { x: 3, y: 5.5 }, range: null, field: null };
  const torchBeyond: LightSource = {
    center: { x: 9, y: 5.5 },
    range: lightRange(3, 0),
    cone: null,
  };

  it('a torch on the other side lights the closed door for an eye without range', () => {
    const walls = [cellDoor];
    expect(doorSeenBy(context(walls, 'dark', [corridorEye], [torchBeyond]), cellDoor)).toBe(true);
  });

  it('with the torch out the door is not seen', () => {
    expect(doorSeenBy(context([cellDoor], 'dark', [corridorEye], []), cellDoor)).toBe(false);
  });

  it('a wall between the eye and the lit door hides it', () => {
    const walls = [lineWall([5, 0], [5, 12]), cellDoor];
    expect(doorSeenBy(context(walls, 'dark', [corridorEye], [torchBeyond]), cellDoor)).toBe(false);
  });
});

describe('sightLevel of an eye in a cone', () => {
  const lyraBox = { x: 5, y: 5, width: 1, height: 1 };
  const lyraCenter = { x: 5.5, y: 5.5 };

  function lyra(direction = 0, angle = 90, range: SightRange | null = sightRange(6, 6)): Eye {
    return eyeOf(lyraCenter, range, eyeFieldOf(lyraBox, direction, angle));
  }

  function seenBy(eye: Eye, col: number, mode: SightMode = 'dark', lights: LightSource[] = []) {
    return sightLevel({ eyes: [eye], walls: [], mode, lights }, tokenAt(col, 5));
  }

  function torchOver(col: number): LightSource {
    return { center: { x: col + 0.5, y: 5.5 }, range: lightRange(2, 0), cone: null };
  }

  it('an ogre ahead, at column 9, is seen', () => {
    expect(seenBy(lyra(), 9)).toBe('seen');
  });

  it('an ogre behind, at column 1, is hidden, though a 360° eye sees it', () => {
    expect(seenBy(lyra(), 1)).toBe('hidden');
    expect(seenBy(lyra(0, 360), 1)).toBe('seen');
  });

  it('a goblin right behind (column 4) is felt by the ring, one 2 cells behind (column 3) is not', () => {
    expect(seenBy(lyra(), 4)).toBe('seen');
    expect(seenBy(lyra(), 3)).toBe('hidden');
  });

  it('a blind eye does not see the goblin right behind in the dark, but sees it under a torch', () => {
    const blind = lyra(0, 90, null);
    expect(seenBy(blind, 4)).toBe('hidden');
    expect(seenBy(blind, 4, 'dark', [torchOver(4)])).toBe('seen');
  });

  it('a blind eye looking right does not see the lit ogre behind it: the cone limits light too', () => {
    expect(seenBy(lyra(0, 90, null), 1, 'dark', [torchOver(1)])).toBe('hidden');
  });

  it('by daylight the ogre behind is hidden and the one ahead is seen', () => {
    expect(seenBy(lyra(), 1, 'daylight')).toBe('hidden');
    expect(seenBy(lyra(), 9, 'daylight')).toBe('seen');
  });

  it('with vision off the ogre behind is seen', () => {
    expect(seenBy(lyra(), 1, 'off')).toBe('seen');
  });

  it('a field of 360° is no field, and 90° is the cone around the footprint', () => {
    expect(eyeFieldOf(lyraBox, 0, 360)).toBeNull();
    expect(eyeFieldOf(lyraBox, 180, 90)).toEqual({
      cone: { facing: 180, angle: 90 },
      around: lyraBox,
    });
  });

  it('a door behind the eye (x = 3) is not seen looking right, and is seen looking left', () => {
    const door = lineWall([3, 4], [3, 7], 'door', 'closed');
    expect(doorSeenBy(context([door], 'dark', [lyra()]), door)).toBe(false);
    expect(doorSeenBy(context([door], 'dark', [lyra(180)]), door)).toBe(true);
  });

  it("a door right at the eye's back (x = 4) is felt by the ring", () => {
    const door = lineWall([4, 4], [4, 7], 'door', 'closed');
    expect(doorSeenBy(context([door], 'dark', [lyra()]), door)).toBe(true);
  });
});
