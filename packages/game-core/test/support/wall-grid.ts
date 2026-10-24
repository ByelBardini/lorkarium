import { wall, type Wall, type WallKind, type WallPoint } from '../../src/wall.vo';

const ROOMS_PER_SIDE = 10;
const ROOM_CELLS = 10;
const DOOR_STATES = ['closed', 'open', 'locked'] as const;

/** The 100 × 100 scene of the stress dungeon. */
export const STRESS_SCENE = { widthCells: 100, heightCells: 100 } as const;

/** The walls of the stress dungeon (docs/context/client/performance.md) as game-core VOs: 10 × 10
 *  rooms of 10 cells, each with a notched north wall, a door and a west wall — 300 walls, 900
 *  segments, with grates and curtains.
 *
 *  Example: `sightArea({ x: 2.5, y: 2.5 }, stressWallGrid(), STRESS_SCENE, 12)` */
export function stressWallGrid(): Wall[] {
  const walls: Wall[] = [];
  for (let room = 0; room < ROOMS_PER_SIDE * ROOMS_PER_SIDE; room += 1) {
    const x = (room % ROOMS_PER_SIDE) * ROOM_CELLS;
    const y = Math.floor(room / ROOMS_PER_SIDE) * ROOM_CELLS;
    const northKind: WallKind = room % 10 === 3 ? 'grate' : room % 10 === 7 ? 'curtain' : 'wall';
    walls.push(freehand(northKind, x, y, 4, 1, NOTCHED_NORTH));
    walls.push(doorAt(x + 4, y, DOOR_STATES[room % DOOR_STATES.length] ?? 'closed'));
    walls.push(freehand('wall', x, y + 3, 1, 7, JAMBED_WEST));
  }
  return walls;
}

const NOTCHED_NORTH: WallPoint[] = [
  [0, 1],
  [0, 0],
  [4, 0],
  [4, 1],
  [3.5, 1],
];
const JAMBED_WEST: WallPoint[] = [
  [1, 0],
  [0, 0],
  [0, 7],
  [1, 7],
  [1, 6.5],
];

function freehand(
  kind: WallKind,
  x: number,
  y: number,
  width: number,
  height: number,
  points: WallPoint[],
): Wall {
  return wall({ kind, shape: 'freehand', x, y, width, height, points, doorState: null });
}

function doorAt(x: number, y: number, doorState: (typeof DOOR_STATES)[number]): Wall {
  const points: WallPoint[] = [
    [0, 0],
    [2, 0],
  ];
  return wall({ kind: 'door', shape: 'line', x, y, width: 2, height: 0, points, doorState });
}
