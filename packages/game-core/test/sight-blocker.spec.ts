import { describe, expect, it } from 'vitest';
import type { Vector2 } from '../src/facing';
import { ROUND_RADIUS_SHARE, sightBlockerOf, type SightBlockerToken } from '../src/sight-blocker';
import type { SightOutline } from '../src/sight-outline.vo';
import { wallSegments } from '../src/wall-segments';
import { blocksMovement, blocksSight, type Wall } from '../src/wall.vo';

const SCENE = { widthCells: 20, heightCells: 20 };
const TRIANGLE: SightOutline = [
  [
    [0.5, 0],
    [1, 1],
    [0, 1],
  ],
];
// A corner away from the center, so a mirror or a turn moves every vertex.
const CORNER_TRIANGLE: SightOutline = [
  [
    [0, 0],
    [0.5, 0],
    [0, 0.5],
  ],
];

function statueOf(overrides: Partial<SightBlockerToken> = {}): SightBlockerToken {
  return {
    tokenId: 'statue',
    box: { x: 3, y: 3, width: 2, height: 2 },
    frame: 'square',
    hasImage: true,
    outline: TRIANGLE,
    facing: 0,
    flipX: false,
    flipY: false,
    ...overrides,
  };
}

function closedPath(value: Wall | undefined): Vector2[] {
  if (!value) throw new TypeError('Expected a wall, got undefined.');
  const segments = wallSegments(value);
  return [...segments.map(({ from }) => from), ...segments.slice(-1).map(({ to }) => to)];
}

function expectPath(value: Wall | undefined, expected: readonly (readonly [number, number])[]) {
  const path = closedPath(value);
  expect(path).toHaveLength(expected.length);
  expected.forEach(([x, y], index) => {
    expect(path[index]?.x).toBeCloseTo(x, 9);
    expect(path[index]?.y).toBeCloseTo(y, 9);
  });
}

describe('sightBlockerOf: the wall of a traced outline', () => {
  it('a triangle on a 2 × 2 token at (3, 3) gives one closed curtain through its vertices', () => {
    const blocker = sightBlockerOf(statueOf(), SCENE);
    expect(blocker.tokenId).toBe('statue');
    expect(blocker.walls).toHaveLength(1);
    expect(blocker.walls[0]?.kind).toBe('curtain');
    expect(blocker.walls[0]?.shape).toBe('freehand');
    expectPath(blocker.walls[0], [
      [4, 3],
      [5, 5],
      [3, 5],
      [4, 3],
    ]);
  });

  it('the wall box is the box of its points, which are relative to it', () => {
    const [wallOfStatue] = sightBlockerOf(statueOf(), SCENE).walls;
    expect(wallOfStatue).toMatchObject({ x: 3, y: 3, width: 2, height: 2, doorState: null });
    expect(wallOfStatue?.points).toEqual([
      [1, 0],
      [2, 2],
      [0, 2],
      [1, 0],
    ]);
  });

  it('the wall cuts sight and lets the token through', () => {
    const [wallOfStatue] = sightBlockerOf(statueOf(), SCENE).walls;
    expect(wallOfStatue && blocksSight(wallOfStatue)).toBe(true);
    expect(wallOfStatue && blocksMovement(wallOfStatue)).toBe(false);
  });

  it('polygons repeat the shape in absolute cells, without the closing vertex', () => {
    expect(sightBlockerOf(statueOf(), SCENE).polygons).toEqual([
      [
        { x: 4, y: 3 },
        { x: 5, y: 5 },
        { x: 3, y: 5 },
      ],
    ]);
  });

  it('two islands give two walls and two polygons', () => {
    const outline: SightOutline = [
      [
        [0, 0],
        [0.25, 0],
        [0, 0.25],
      ],
      [
        [1, 1],
        [0.75, 1],
        [1, 0.75],
      ],
    ];
    const blocker = sightBlockerOf(statueOf({ outline }), SCENE);
    expect(blocker.walls).toHaveLength(2);
    expect(blocker.polygons).toHaveLength(2);
    expectPath(blocker.walls[1], [
      [5, 5],
      [4.5, 5],
      [5, 4.5],
      [5, 5],
    ]);
  });
});

describe('sightBlockerOf: the pose follows the art', () => {
  const pose = (overrides: Partial<SightBlockerToken>) =>
    sightBlockerOf(statueOf({ outline: CORNER_TRIANGLE, ...overrides }), SCENE).walls[0];

  it('flipX mirrors across the vertical through the center', () => {
    expectPath(pose({ flipX: true }), [
      [5, 3],
      [4, 3],
      [5, 4],
      [5, 3],
    ]);
  });

  it('flipY mirrors across the horizontal through the center', () => {
    expectPath(pose({ flipY: true }), [
      [3, 5],
      [4, 5],
      [3, 4],
      [3, 5],
    ]);
  });

  it('facing 90 turns clockwise on screen around the center', () => {
    expectPath(pose({ facing: 90 }), [
      [5, 3],
      [5, 4],
      [4, 3],
      [5, 3],
    ]);
  });

  it('a 2 × 1 footprint stretches the unit cell along each side', () => {
    expectPath(pose({ box: { x: 4, y: 4, width: 2, height: 1 } }), [
      [4, 4],
      [5, 4],
      [4, 4.5],
      [4, 4],
    ]);
  });

  it('on a 2 × 1 footprint the order is stretch, then mirror, then turn', () => {
    // Center (5, 4.5). Stretched and mirrored: (1, −0.5), (0, −0.5), (1, 0). Turned 90: (0.5, 1),
    // (0.5, 0), (0, 1).
    const wallOfHorse = pose({ box: { x: 4, y: 4, width: 2, height: 1 }, flipX: true, facing: 90 });
    expectPath(wallOfHorse, [
      [5.5, 5.5],
      [5.5, 4.5],
      [5, 5.5],
      [5.5, 5.5],
    ]);
  });
});

describe('sightBlockerOf: the shape by case', () => {
  const FOOTPRINT = [
    [3, 3],
    [5, 3],
    [5, 5],
    [3, 5],
    [3, 3],
  ] as const;

  it('an image from before the feature (null outline) blocks by the footprint rectangle', () => {
    expectPath(sightBlockerOf(statueOf({ outline: null }), SCENE).walls[0], FOOTPRINT);
  });

  it('a fully transparent image (empty outline) blocks by the footprint rectangle', () => {
    expectPath(sightBlockerOf(statueOf({ outline: [] }), SCENE).walls[0], FOOTPRINT);
  });

  it('the footprint rectangle of an image turns with the facing', () => {
    const box = { x: 4, y: 4, width: 2, height: 1 };
    const turned = sightBlockerOf(statueOf({ outline: null, box, facing: 90 }), SCENE);
    expectPath(turned.walls[0], [
      [5.5, 3.5],
      [5.5, 5.5],
      [4.5, 5.5],
      [4.5, 3.5],
      [5.5, 3.5],
    ]);
  });

  it('the round frame ignores the outline: a 32-sided ellipse of radius 0.42 of each side', () => {
    const box = { x: 4, y: 4, width: 2, height: 1 };
    const [disc] = sightBlockerOf(statueOf({ frame: 'round', box }), SCENE).walls;
    const path = closedPath(disc);
    expect(ROUND_RADIUS_SHARE).toBe(0.42);
    expect(path).toHaveLength(33);
    expect(path[0]?.x).toBeCloseTo(5.84, 9);
    expect(path[0]?.y).toBeCloseTo(4.5, 9);
    expect(path[8]?.x).toBeCloseTo(5, 9);
    expect(path[8]?.y).toBeCloseTo(4.92, 9);
    expect(path[32]?.x).toBeCloseTo(5.84, 9);
  });

  it('the round frame with an image turns with the facing', () => {
    const box = { x: 4, y: 4, width: 2, height: 1 };
    const [disc] = sightBlockerOf(statueOf({ frame: 'round', box, facing: 90 }), SCENE).walls;
    const path = closedPath(disc);
    expect(path[0]?.x).toBeCloseTo(5, 9);
    expect(path[0]?.y).toBeCloseTo(5.34, 9);
  });

  // The token with no image is always drawn as the disc of initials, even with the square frame
  // (the default), and the shape that blocks is the one on the screen.
  it('without an image the square frame is the ellipse of the disc and does not turn', () => {
    const token = statueOf({
      hasImage: false,
      outline: null,
      box: { x: 4, y: 4, width: 2, height: 1 },
      facing: 90,
    });
    const path = closedPath(sightBlockerOf(token, SCENE).walls[0]);
    expect(path).toHaveLength(33);
    expect(path[0]?.x).toBeCloseTo(5.84, 9);
    expect(path[0]?.y).toBeCloseTo(4.5, 9);
  });

  it('without an image an outline left in the input is not read', () => {
    const token = statueOf({ hasImage: false });
    expect(closedPath(sightBlockerOf(token, SCENE).walls[0])).toHaveLength(33);
  });

  it('without an image the round frame is the ellipse and does not turn', () => {
    const token = statueOf({
      hasImage: false,
      outline: null,
      frame: 'round',
      box: { x: 4, y: 4, width: 2, height: 1 },
      facing: 90,
    });
    const path = closedPath(sightBlockerOf(token, SCENE).walls[0]);
    expect(path).toHaveLength(33);
    expect(path[0]?.x).toBeCloseTo(5.84, 9);
    expect(path[0]?.y).toBeCloseTo(4.5, 9);
  });
});

describe('sightBlockerOf: the scene border', () => {
  it('a turn that leaves the scene holds the points on the border, with no RangeError', () => {
    const box = { x: 0, y: 2, width: 4, height: 1 };
    const scene = { widthCells: 4, heightCells: 3 };
    const token = statueOf({ outline: null, box, facing: 90 });
    const blocker = sightBlockerOf(token, scene);
    // The 4 × 1 stands on its center (2, 2.5): from x 1.5 to 2.5 and y 0.5 to 4.5, cut at y 3.
    expectPath(blocker.walls[0], [
      [2.5, 0.5],
      [2.5, 3],
      [1.5, 3],
      [1.5, 0.5],
      [2.5, 0.5],
    ]);
    expect(blocker.polygons[0]).toHaveLength(4);
    expect(blocker.polygons[0]?.[1]?.y).toBe(3);
  });

  it('a turn past the left and the right holds x on the border too', () => {
    // The 1 × 4 lies on its center (0.5, 2): from x −1.5 to 2.5, cut at 0 and at 2.
    const box = { x: 0, y: 0, width: 1, height: 4 };
    const scene = { widthCells: 2, heightCells: 20 };
    const blocker = sightBlockerOf(statueOf({ outline: null, box, facing: 90 }), scene);
    expectPath(blocker.walls[0], [
      [2, 1.5],
      [2, 2.5],
      [0, 2.5],
      [0, 1.5],
      [2, 1.5],
    ]);
  });

  it('a turn past the top left corner never gives a negative coordinate', () => {
    const box = { x: 0, y: 0, width: 4, height: 1 };
    const blocker = sightBlockerOf(statueOf({ outline: null, box, facing: 90 }), SCENE);
    const lowest = blocker.polygons.flat().reduce((low, { y }) => Math.min(low, y), Infinity);
    expect(lowest).toBe(0);
    expect(blocker.walls[0]?.y).toBe(0);
  });
});
