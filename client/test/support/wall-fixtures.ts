import type { WallDto } from '@lorkarium/contracts';

export const NORTH_WALL_ID = 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f';
export const CELL_DOOR_ID = 'd4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f7a';
export const GRATE_BOX_ID = 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a8b';

/** The north wall of VHARN: a straight wall from (2, 2) to (6, 2).
 *
 *  Example: `vharnBoard({ walls: [northWall({ kind: 'grate' })] })` */
export function northWall(overrides: Partial<WallDto> = {}): WallDto {
  return {
    id: NORTH_WALL_ID,
    kind: 'wall',
    shape: 'line',
    x: 2,
    y: 2,
    width: 4,
    height: 0,
    points: [
      [0, 0],
      [4, 0],
    ],
    doorState: null,
    ...overrides,
  } as WallDto;
}

/** The closed door of the cell at VHARN: a vertical line from (7, 5) to (7, 6).
 *
 *  Example: `cellDoor({ doorState: 'locked' })` */
export function cellDoor(overrides: Partial<WallDto> = {}): WallDto {
  return northWall({
    id: CELL_DOOR_ID,
    kind: 'door',
    x: 7,
    y: 5,
    width: 0,
    height: 1,
    points: [
      [0, 0],
      [0, 1],
    ],
    doorState: 'closed',
    ...overrides,
  });
}

/** A grate box at (8, 3), 2×2.
 *
 *  Example: `vharnBoard({ walls: [grateBox()] })` */
export function grateBox(overrides: Partial<WallDto> = {}): WallDto {
  return {
    id: GRATE_BOX_ID,
    kind: 'grate',
    shape: 'rectangle',
    x: 8,
    y: 3,
    width: 2,
    height: 2,
    doorState: null,
    ...overrides,
  } as WallDto;
}
