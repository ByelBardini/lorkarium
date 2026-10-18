import type { WallShapeDto } from '@lorkarium/contracts';
import type { WallPo } from '../../src/modules/walls/walls.po';
import { VHARN_SCENE_ID } from './scenes-factories';

export const NORTH_WALL_ID = 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b';
export const CELL_DOOR_ID = 'f2a3b4c5-d6e7-4f8a-9b0c-1d2e3f4a5b6c';

const CREATED = new Date('2026-10-18T12:00:00Z');

/** The north wall of the VHARN scene: a straight wall from (2, 2) to (6, 2).
 *
 *  Example: `northWallPo({ kind: 'grate' })` */
export function northWallPo(overrides: Partial<WallPo> = {}): WallPo {
  return {
    id: NORTH_WALL_ID,
    sceneId: VHARN_SCENE_ID,
    wallOrder: 1,
    kind: 'wall',
    shape: 'line',
    x: '2.00',
    y: '2.00',
    width: '4.00',
    height: '0.00',
    points: [
      [0, 0],
      [4, 0],
    ],
    doorState: null,
    createdAt: CREATED,
    ...overrides,
  };
}

/** The closed door of the cell on the VHARN scene: a vertical line from (7, 5) to (7, 6).
 *
 *  Example: `cellDoorPo({ doorState: 'locked' })` */
export function cellDoorPo(overrides: Partial<WallPo> = {}): WallPo {
  return northWallPo({
    id: CELL_DOOR_ID,
    wallOrder: 2,
    kind: 'door',
    x: '7.00',
    y: '5.00',
    width: '0.00',
    height: '1.00',
    points: [
      [0, 0],
      [0, 1],
    ],
    doorState: 'closed',
    ...overrides,
  });
}

/** A grate box as the master draws it: (4, 4), 2×2.
 *
 *  Example: `service.createMany(ANA_ID, VHARN_ID, { walls: [newGrate()] })` */
export function newGrate(overrides: Partial<WallShapeDto> = {}): WallShapeDto {
  return {
    kind: 'grate',
    shape: 'rectangle',
    x: 4,
    y: 4,
    width: 2,
    height: 2,
    ...overrides,
  } as WallShapeDto;
}
