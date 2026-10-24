import { describe, expect, it } from 'vitest';
import { coneOf } from '../src/cone.vo';
import { blockedPassage } from '../src/passage';
import { lineOfSight, sightArea } from '../src/sight-area';
import { crossingPoint, preparedWalls } from '../src/wall-index';
import { wall, type DoorState, type Wall, type WallKind } from '../src/wall.vo';
import { naiveLineOfSight, naiveSightArea } from './support/naive-sight';
import { STRESS_SCENE, stressWallGrid } from './support/wall-grid';

const SCENE = { widthCells: 20, heightCells: 12 };

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

// A room with a closed door, two walls in X, a grate and a curtain: every kind sight reads.
const ROOM: Wall[] = [
  lineWall([4, 2], [4, 9]),
  lineWall([4, 2], [9, 2]),
  lineWall([9, 2], [9, 5], 'door', 'closed'),
  lineWall([12, 3], [12, 10]),
  lineWall([11, 6], [15, 6]),
  lineWall([2, 10], [8, 10], 'grate'),
  lineWall([15, 1], [15, 4], 'curtain'),
  wall({
    kind: 'wall',
    shape: 'ellipse',
    x: 16,
    y: 7,
    width: 2,
    height: 3,
    points: null,
    doorState: null,
  }),
];

describe('preparedWalls', () => {
  it('the same array of walls gives back the very same preparation', () => {
    expect(preparedWalls(ROOM)).toBe(preparedWalls(ROOM));
    expect(preparedWalls([...ROOM])).not.toBe(preparedWalls(ROOM));
  });

  it('files only what blocks sight for sight and what blocks movement for passage', () => {
    const walls = preparedWalls([
      lineWall([0, 0], [1, 0], 'grate'),
      lineWall([0, 1], [1, 1], 'curtain'),
    ]);
    expect(walls.sight.wallIndexes).toEqual([1]);
    expect(walls.movement.wallIndexes).toEqual([0]);
  });

  it('knows where the walls in X cross, as crossingPoint measures it', () => {
    const crossings = preparedWalls(ROOM).crossings();
    const { segments } = preparedWalls(ROOM).sight;
    expect(crossings).toHaveLength(1);
    const [only] = crossings;
    expect(only?.point).toEqual({ x: 12, y: 6 });
    expect(only?.point).toEqual(
      crossingPoint(segments[only?.first ?? -1]!, segments[only?.second ?? -1]!),
    );
  });
});

describe('sightArea over prepared walls is the same polygon as before', () => {
  const EYES = [
    { x: 10, y: 4.3 },
    { x: 6.5, y: 5.5 },
    { x: 13.5, y: 8.5 },
    { x: 0.5, y: 0.5 },
    { x: 19.9, y: 11.9 },
  ];

  it.each([3, 6, 10, Infinity])('in the room, every eye with reach %s', (reach) => {
    for (const eye of EYES) {
      expect(sightArea(eye, ROOM, SCENE, reach)).toEqual(naiveSightArea(eye, ROOM, SCENE, reach));
    }
  });

  it('a cone of 90° with its ring, as before', () => {
    const field = { cone: coneOf(30, 90)!, around: { x: 6, y: 5, width: 1, height: 1 } };
    const eye = { x: 6.5, y: 5.5 };
    expect(sightArea(eye, ROOM, SCENE, 8, field)).toEqual(
      naiveSightArea(eye, ROOM, SCENE, 8, field),
    );
  });

  it.each([12, Infinity])('across the 900 segments of the stress dungeon, reach %s', (reach) => {
    const walls = stressWallGrid();
    for (const eye of [
      { x: 52.5, y: 52.5 },
      { x: 2.5, y: 2.5 },
      { x: 77.3, y: 31.9 },
    ]) {
      expect(sightArea(eye, walls, STRESS_SCENE, reach)).toEqual(
        naiveSightArea(eye, walls, STRESS_SCENE, reach),
      );
    }
  });
});

describe('lineOfSight and blockedPassage over prepared walls answer as before', () => {
  const LEGS: [{ x: number; y: number }, { x: number; y: number }][] = [
    [
      { x: 1, y: 5 },
      { x: 8, y: 5 },
    ],
    [
      { x: 5, y: 5 },
      { x: 8, y: 5 },
    ],
    [
      { x: 10, y: 4 },
      { x: 14, y: 8 },
    ],
    [
      { x: 4, y: 1 },
      { x: 4, y: 2 },
    ],
    [
      { x: 3, y: 11 },
      { x: 3, y: 9 },
    ],
    [
      { x: 12, y: 6 },
      { x: 12, y: 0 },
    ],
    [
      { x: 0, y: 0 },
      { x: 20, y: 12 },
    ],
  ];

  it('blocked, clear and touching at an end, leg by leg', () => {
    for (const [from, to] of LEGS) {
      expect(lineOfSight(from, to, ROOM)).toBe(naiveLineOfSight(from, to, ROOM));
    }
  });

  it('the long legs across the dungeon', () => {
    const walls = stressWallGrid();
    const targets = [
      { x: 2.5, y: 97.5 },
      { x: 97.5, y: 2.5 },
      { x: 55, y: 50 },
      { x: 52.5, y: 30 },
    ];
    for (const to of targets) {
      expect(lineOfSight({ x: 52.5, y: 52.5 }, to, walls)).toBe(
        naiveLineOfSight({ x: 52.5, y: 52.5 }, to, walls),
      );
    }
  });

  it('the first wall barring a path is the one of lowest index on the first leg it bars', () => {
    const walls = [
      lineWall([6, 0], [6, 12]),
      lineWall([3, 0], [3, 12]),
      lineWall([2, 10], [8, 10], 'grate'),
    ];
    const path = [
      { x: 1, y: 5 },
      { x: 1, y: 11 },
      { x: 9, y: 11 },
    ];
    expect(blockedPassage(path, walls)).toEqual({ legIndex: 1, wallIndex: 0 });
    expect(
      blockedPassage(
        [
          { x: 1, y: 5 },
          { x: 9, y: 5 },
        ],
        walls,
      ),
    ).toEqual({ legIndex: 0, wallIndex: 0 });
    expect(
      blockedPassage(
        [
          { x: 1, y: 5 },
          { x: 2.5, y: 5 },
        ],
        walls,
      ),
    ).toBeNull();
  });
});
