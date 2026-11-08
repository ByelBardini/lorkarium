import { describe, expect, it, vi } from 'vitest';
import { eyeFieldOf, eyeOf, sightLevel, doorSeenBy, sightRange } from '../src/token-sight';
import type { Eye, SightContext, SightMode, SightTarget } from '../src/token-sight';
import type { Vector2 } from '../src/facing';
import { lightRange } from '../src/light.vo';
import { lightLevelAt, lightSource, type LightSource } from '../src/lighting';
import { blockedPassage } from '../src/passage';
import { blockersIgnoredAt, sightBlockerOf, type SightBlocker } from '../src/sight-blocker';
import { leftOutWith, lineOfSight, sightArea } from '../src/sight-area';
import type { SightOutline } from '../src/sight-outline.vo';
import { preparedWalls } from '../src/wall-index';
import { wallSegments } from '../src/wall-segments';
import { wall, type Wall } from '../src/wall.vo';
import { naiveSightArea } from './support/naive-sight';
import { STRESS_SCENE, stressWallGrid } from './support/wall-grid';

// Preparing an array reads the segments of its walls, so counting this counts preparations.
vi.mock('../src/wall-segments', async (original) => {
  const actual = await original<typeof import('../src/wall-segments')>();
  return { ...actual, wallSegments: vi.fn(actual.wallSegments) };
});

const SCENE = { widthCells: 12, heightCells: 10 };
const FAR_EYE = { x: 1, y: 5 };
const STATUE_CENTER = { x: 5, y: 5 };
const BEHIND = { x: 7, y: 5 };
const TARGET_BEHIND: SightTarget = {
  box: { x: 6.5, y: 4.5, width: 1, height: 1 },
  scenery: false,
};
const TORCH_RANGE = lightRange(20, 0);

function blockerAt(
  tokenId: string,
  x: number,
  y: number,
  outline: SightOutline | null = null,
): SightBlocker {
  return sightBlockerOf(
    {
      tokenId,
      box: { x, y, width: 2, height: 2 },
      frame: 'square',
      hasImage: true,
      outline,
      facing: 0,
      flipX: false,
      flipY: false,
    },
    SCENE,
  );
}

const STATUE = blockerAt('statue', 4, 4);

function dayContext(eye: Eye, walls: readonly Wall[], mode: SightMode = 'daylight'): SightContext {
  return { eyes: [eye], walls, mode, lights: [] };
}

function torchAt(center: Vector2, ignores?: readonly Wall[]): LightSource {
  const torch = lightSource(center, TORCH_RANGE, true, null, ignores);
  if (!torch) throw new TypeError('Expected a lit torch, got null.');
  return torch;
}

function verticalLine(x: number, top: number, bottom: number, kind: Wall['kind'] = 'wall'): Wall {
  return wall({
    kind,
    shape: 'line',
    x,
    y: top,
    width: 0,
    height: bottom - top,
    points: [
      [0, 0],
      [0, bottom - top],
    ],
    doorState: kind === 'door' ? 'closed' : null,
  });
}

describe('a blocker hides what lies behind it', () => {
  it('a target straight behind the statue is hidden', () => {
    const context = dayContext(eyeOf(FAR_EYE, null), STATUE.walls);
    expect(sightLevel(context, TARGET_BEHIND)).toBe('hidden');
  });

  it('a target off the line past the statue is seen', () => {
    const context = dayContext(eyeOf(FAR_EYE, null), STATUE.walls);
    const aside: SightTarget = { box: { x: 6.5, y: 0.5, width: 1, height: 1 }, scenery: false };
    expect(sightLevel(context, aside)).toBe('seen');
  });
});

describe('a blocker does not hide itself', () => {
  const statueAsTarget: SightTarget = {
    box: { x: 4, y: 4, width: 2, height: 2 },
    scenery: false,
    ignores: STATUE.walls,
  };

  it('the statue as a target leaving out its own walls is seen', () => {
    const context = dayContext(eyeOf(FAR_EYE, null), STATUE.walls);
    expect(sightLevel(context, statueAsTarget)).toBe('seen');
  });

  it('the same statue with no ignores is behind its own outline', () => {
    const context = dayContext(eyeOf(FAR_EYE, null), STATUE.walls);
    expect(sightLevel(context, { box: statueAsTarget.box, scenery: false })).toBe('hidden');
  });

  it('a statue behind another one stays hidden, even leaving itself out', () => {
    const front = blockerAt('front', 3, 4);
    const back = blockerAt('back', 7, 4);
    const walls = [...front.walls, ...back.walls];
    const target: SightTarget = {
      box: { x: 7, y: 4, width: 2, height: 2 },
      scenery: false,
      ignores: back.walls,
    };
    expect(sightLevel(dayContext(eyeOf(FAR_EYE, null), walls), target)).toBe('hidden');
  });

  it('a statue lit by a torch across its own outline is lit, in the dark', () => {
    const blindEye = eyeOf(FAR_EYE, null);
    const context = { ...dayContext(blindEye, STATUE.walls, 'dark'), lights: [torchAt(FAR_EYE)] };
    expect(sightLevel(context, statueAsTarget)).toBe('seen');
  });
});

describe('blockersIgnoredAt', () => {
  const CORNER_ONLY = [
    [
      [0, 0],
      [0.4, 0],
      [0, 0.4],
    ],
  ] as const;

  it('a point inside a blocker leaves its walls out', () => {
    expect(blockersIgnoredAt(STATUE_CENTER, [STATUE])).toBe(STATUE.walls);
  });

  it('a point outside every blocker gives the one shared empty list', () => {
    const none = blockersIgnoredAt(FAR_EYE, [STATUE], 'someone');
    expect(none).toEqual([]);
    expect(blockersIgnoredAt(BEHIND, [], null)).toBe(none);
  });

  it('the token itself leaves out its own walls with its center out of its shape', () => {
    const corner = blockerAt('corner', 4, 4, CORNER_ONLY);
    expect(blockersIgnoredAt(STATUE_CENTER, [corner], 'corner')).toBe(corner.walls);
  });

  it('another token at that same point, outside the shape, leaves nothing out', () => {
    const corner = blockerAt('corner', 4, 4, CORNER_ONLY);
    expect(blockersIgnoredAt(STATUE_CENTER, [corner], 'other')).toEqual([]);
  });

  it('a point inside two blockers leaves out the walls of both', () => {
    const over = blockerAt('over', 4, 4);
    const ignored = blockersIgnoredAt(STATUE_CENTER, [STATUE, over]);
    expect(ignored).toEqual([...STATUE.walls, ...over.walls]);
  });

  it('standing in one island leaves out the walls of all of them', () => {
    const islands = blockerAt('islands', 4, 4, [
      [
        [0, 0],
        [0.4, 0],
        [0, 0.4],
      ],
      [
        [1, 1],
        [0.6, 1],
        [1, 0.6],
      ],
    ]);
    expect(blockersIgnoredAt({ x: 4.2, y: 4.2 }, [islands])).toHaveLength(2);
  });
});

describe('an eye inside a blocker sees out', () => {
  const walls = STATUE.walls;

  it('an eye standing in the statue, leaving it out, sees past it', () => {
    const eye = eyeOf(STATUE_CENTER, null, null, blockersIgnoredAt(STATUE_CENTER, [STATUE]));
    expect(sightLevel(dayContext(eye, walls), TARGET_BEHIND)).toBe('seen');
  });

  it('the same eye with no ignores stops at the outline', () => {
    expect(sightLevel(dayContext(eyeOf(STATUE_CENTER, null), walls), TARGET_BEHIND)).toBe('hidden');
  });

  it('the blocker token itself, as an eye with a range, sees past its own outline', () => {
    const range = sightRange(4, 0);
    const eye = eyeOf(
      STATUE_CENTER,
      range,
      null,
      blockersIgnoredAt(STATUE_CENTER, [STATUE], 'statue'),
    );
    expect(sightLevel(dayContext(eye, walls, 'dark'), TARGET_BEHIND)).toBe('seen');
  });

  it('leaving the statue out does not leave out the wall past it', () => {
    const allWalls = [...STATUE.walls, verticalLine(6.2, 0, 10)];
    const eye = eyeOf(STATUE_CENTER, null, null, STATUE.walls);
    expect(sightLevel(dayContext(eye, allWalls), TARGET_BEHIND)).toBe('hidden');
  });

  it('an eye facing the target past its statue sees it through its field and ignores', () => {
    const field = eyeFieldOf({ x: 4.5, y: 4.5, width: 1, height: 1 }, 0, 90);
    const eye = eyeOf(STATUE_CENTER, null, field, STATUE.walls);
    expect(sightLevel(dayContext(eye, STATUE.walls), TARGET_BEHIND)).toBe('seen');
  });

  it('leaving the statue out does not widen the field of an eye with its back turned', () => {
    const field = eyeFieldOf({ x: 4.5, y: 4.5, width: 1, height: 1 }, 180, 90);
    const eye = eyeOf(STATUE_CENTER, null, field, STATUE.walls);
    expect(sightLevel(dayContext(eye, STATUE.walls), TARGET_BEHIND)).toBe('hidden');
  });
});

describe('eyeOf and lightSource carry ignores only when there are some', () => {
  it('eyeOf with ignores keeps the same list', () => {
    expect(eyeOf(FAR_EYE, null, null, STATUE.walls).ignores).toBe(STATUE.walls);
  });

  it.each([
    ['nothing', undefined],
    ['an empty list', []],
  ])('eyeOf with %s has the same shape as before', (_, ignores) => {
    expect(eyeOf(FAR_EYE, null, null, ignores)).toStrictEqual({
      center: FAR_EYE,
      range: null,
      field: null,
    });
  });

  it('lightSource with ignores keeps the same list', () => {
    expect(lightSource(FAR_EYE, TORCH_RANGE, true, null, STATUE.walls)?.ignores).toBe(STATUE.walls);
  });

  it.each([
    ['nothing', undefined],
    ['an empty list', []],
  ])('lightSource with %s has the same shape as before', (_, ignores) => {
    expect(lightSource(FAR_EYE, TORCH_RANGE, true, null, ignores)).toStrictEqual({
      center: FAR_EYE,
      range: TORCH_RANGE,
      cone: null,
    });
  });
});

describe('a blocker cuts the light', () => {
  it('a torch behind the statue does not light the target', () => {
    expect(lightLevelAt(BEHIND, [torchAt(FAR_EYE)], STATUE.walls)).toBe('hidden');
  });

  it('a torch with a clear line lights the same point', () => {
    expect(lightLevelAt(BEHIND, [torchAt({ x: 7, y: 1 })], STATUE.walls)).toBe('seen');
  });

  it("the blocker's own torch shines out of it", () => {
    const own = torchAt(STATUE_CENTER, blockersIgnoredAt(STATUE_CENTER, [STATUE], 'statue'));
    expect(lightLevelAt(BEHIND, [own], STATUE.walls)).toBe('seen');
  });

  it('a torch inside another blocker shines out of it', () => {
    const dropped = torchAt(STATUE_CENTER, blockersIgnoredAt(STATUE_CENTER, [STATUE], 'someone'));
    expect(lightLevelAt(BEHIND, [dropped], STATUE.walls)).toBe('seen');
  });

  it('a torch in the statue with no ignores stays in it', () => {
    expect(lightLevelAt(BEHIND, [torchAt(STATUE_CENTER)], STATUE.walls)).toBe('hidden');
  });

  it('the except list and the ignores of the light count together', () => {
    const lantern = blockerAt('lantern-holder', 1, 4);
    const walls = [...lantern.walls, ...STATUE.walls];
    const held = torchAt({ x: 2, y: 5 }, lantern.walls);
    expect(lightLevelAt(STATUE_CENTER, [held], walls, STATUE.walls)).toBe('seen');
    expect(lightLevelAt(STATUE_CENTER, [held], walls)).toBe('hidden');
    expect(lightLevelAt(STATUE_CENTER, [torchAt({ x: 2, y: 5 })], walls, STATUE.walls)).toBe(
      'hidden',
    );
  });
});

describe('lineOfSight with a list in except', () => {
  it('every wall of the list is left out', () => {
    const first = verticalLine(2, 0, 10);
    const second = verticalLine(4, 0, 10);
    const walls = [first, second];
    expect(lineOfSight(FAR_EYE, BEHIND, walls, [first, second])).toBe(true);
  });

  it('a wall not in the list still cuts', () => {
    const first = verticalLine(2, 0, 10);
    const second = verticalLine(4, 0, 10);
    expect(lineOfSight(FAR_EYE, BEHIND, [first, second], [first])).toBe(false);
  });

  it('an empty list leaves nothing out', () => {
    expect(lineOfSight(FAR_EYE, BEHIND, [verticalLine(2, 0, 10)], [])).toBe(false);
  });

  it('one wall alone still works as before', () => {
    const first = verticalLine(2, 0, 10);
    expect(lineOfSight(FAR_EYE, BEHIND, [first], first)).toBe(true);
  });
});

describe('leftOutWith', () => {
  const door = verticalLine(8, 3, 7, 'door');

  it.each([
    ['nothing', undefined],
    ['an empty list', []],
  ])('adding %s gives the same except back, allocating nothing', (_, ignores) => {
    expect(leftOutWith(door, ignores)).toBe(door);
    expect(leftOutWith(STATUE.walls, ignores)).toBe(STATUE.walls);
    expect(leftOutWith(undefined, ignores)).toBeUndefined();
  });

  it('with no except, the ignores are the same list', () => {
    expect(leftOutWith(undefined, STATUE.walls)).toBe(STATUE.walls);
  });

  it('one wall and a list join', () => {
    expect(leftOutWith(door, STATUE.walls)).toEqual([door, ...STATUE.walls]);
  });

  it('two lists join', () => {
    const other = blockerAt('other', 8, 4);
    expect(leftOutWith(other.walls, STATUE.walls)).toEqual([...other.walls, ...STATUE.walls]);
  });
});

describe('sightArea with ignores', () => {
  const real = [verticalLine(8, 2, 8), verticalLine(1.5, 1, 3)];
  const withStatue = [...real, ...STATUE.walls];

  it.each([
    ['a reach of 3', 3],
    ['a reach of 12', 12],
    ['no reach limit', Infinity],
  ])('with %s, the polygon is the one of the scene without that blocker', (_, reach) => {
    const area = sightArea(STATUE_CENTER, withStatue, SCENE, reach, undefined, STATUE.walls);
    expect(area).toEqual(naiveSightArea(STATUE_CENTER, real, SCENE, reach));
  });

  it('with no ignores, the polygon is the one with the blocker as a plain wall', () => {
    const area = sightArea(FAR_EYE, withStatue, SCENE, 12);
    expect(area).toEqual(naiveSightArea(FAR_EYE, withStatue, SCENE, 12));
  });

  it('with an empty list, the polygon is the same as with no list', () => {
    const area = sightArea(FAR_EYE, withStatue, SCENE, 12, undefined, []);
    expect(area).toEqual(sightArea(FAR_EYE, withStatue, SCENE, 12));
  });

  it('a crossing of a left-out wall with a real one gives no ray of its own', () => {
    const across = [verticalLine(5, 0, 10), ...STATUE.walls];
    const area = sightArea(FAR_EYE, across, SCENE, Infinity, undefined, STATUE.walls);
    expect(area).toEqual(naiveSightArea(FAR_EYE, [verticalLine(5, 0, 10)], SCENE, Infinity));
  });

  it('a field keeps working over the ignores', () => {
    const field = eyeFieldOf({ x: 4.5, y: 4.5, width: 1, height: 1 }, 0, 90) ?? undefined;
    const area = sightArea(STATUE_CENTER, withStatue, SCENE, 12, field, STATUE.walls);
    expect(area).toEqual(naiveSightArea(STATUE_CENTER, real, SCENE, 12, field));
  });

  it('over the stress dungeon, only that blocker comes off, vertex for vertex', () => {
    const dungeon = stressWallGrid();
    const hall = sightBlockerOf(
      {
        tokenId: 'hall',
        box: { x: 12, y: 12, width: 4, height: 4 },
        frame: 'round',
        hasImage: true,
        outline: null,
        facing: 0,
        flipX: false,
        flipY: false,
      },
      STRESS_SCENE,
    );
    const other = blockerAt('other', 20, 14);
    const walls = [...dungeon, ...hall.walls, ...other.walls];
    const eye = { x: 14, y: 14 };
    const area = sightArea(eye, walls, STRESS_SCENE, 12, undefined, hall.walls);
    expect(area).toEqual(naiveSightArea(eye, [...dungeon, ...other.walls], STRESS_SCENE, 12));
  });
});

describe('a blocker and the doors', () => {
  const door = verticalLine(8, 3, 7, 'door');
  const walls = [door, ...STATUE.walls];

  it('a statue between the eye and the door hides it', () => {
    expect(doorSeenBy(dayContext(eyeOf(FAR_EYE, null), walls), door)).toBe(false);
  });

  it('the same door without the statue is seen', () => {
    expect(doorSeenBy(dayContext(eyeOf(FAR_EYE, null), [door]), door)).toBe(true);
  });

  it('an eye in the statue, leaving it out, sees the door that does not hide itself', () => {
    const eye = eyeOf(STATUE_CENTER, null, null, STATUE.walls);
    expect(doorSeenBy(dayContext(eye, walls), door)).toBe(true);
  });

  it('the ignores of the eye do not leave out another wall on the way', () => {
    const eye = eyeOf(STATUE_CENTER, null, null, STATUE.walls);
    const blocked = [door, ...STATUE.walls, verticalLine(7, 0, 10)];
    expect(doorSeenBy(dayContext(eye, blocked), door)).toBe(false);
  });

  it('a torch in the statue lights the door from behind, with both left out of its line', () => {
    const blindEye = eyeOf({ x: 9, y: 5 }, null);
    const context = {
      ...dayContext(blindEye, walls, 'dark'),
      lights: [torchAt(STATUE_CENTER, STATUE.walls)],
    };
    expect(doorSeenBy(context, door)).toBe(true);
  });

  it('a torch in the statue with no ignores does not reach the door', () => {
    const blindEye = eyeOf({ x: 9, y: 5 }, null);
    const context = { ...dayContext(blindEye, walls, 'dark'), lights: [torchAt(STATUE_CENTER)] };
    expect(doorSeenBy(context, door)).toBe(false);
  });
});

describe('a blocker and the passage', () => {
  it('a path across the curtain of a blocker is free', () => {
    expect(blockedPassage([FAR_EYE, BEHIND], STATUE.walls)).toBeNull();
  });
});

describe('every eye shares one preparation', () => {
  it('rules with ignores never prepare another array', () => {
    const walls = [verticalLine(8, 2, 8), ...STATUE.walls];
    const preparation = preparedWalls(walls);
    vi.mocked(wallSegments).mockClear();
    const eye = eyeOf(STATUE_CENTER, null, null, STATUE.walls);
    sightArea(STATUE_CENTER, walls, SCENE, 12, undefined, STATUE.walls);
    lineOfSight(STATUE_CENTER, BEHIND, walls, STATUE.walls);
    lightLevelAt(BEHIND, [torchAt(STATUE_CENTER, STATUE.walls)], walls, STATUE.walls);
    sightLevel(dayContext(eye, walls), { ...TARGET_BEHIND, ignores: STATUE.walls });
    expect(wallSegments).toHaveBeenCalledTimes(0);
    expect(preparedWalls(walls)).toBe(preparation);
  });
});
