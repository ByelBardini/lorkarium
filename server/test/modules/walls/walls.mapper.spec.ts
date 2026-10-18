import { describe, expect, it } from 'vitest';
import {
  toNewWallPo,
  toWallDto,
  toWallMovePo,
  wallOfRow,
} from '../../../src/modules/walls/walls.mapper';
import { VHARN_SCENE_ID } from '../../support/scenes-factories';
import {
  CELL_DOOR_ID,
  cellDoorPo,
  NORTH_WALL_ID,
  newGrate,
  northWallPo,
} from '../../support/walls-factories';

describe('toWallDto', () => {
  it('a straight wall row with "2.00" becomes the DTO in numbers', () => {
    expect(toWallDto(northWallPo())).toEqual({
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
    });
  });

  it('a rectangle row carries no points', () => {
    const box = northWallPo({ shape: 'rectangle', height: '3.00', points: null });
    expect(toWallDto(box)).toEqual({
      id: NORTH_WALL_ID,
      kind: 'wall',
      shape: 'rectangle',
      x: 2,
      y: 2,
      width: 4,
      height: 3,
      doorState: null,
    });
  });

  it('a closed door keeps its state', () => {
    expect(toWallDto(cellDoorPo()).doorState).toBe('closed');
  });

  it('a broken row (a door saved as an ellipse) throws citing the wall, with the cause', () => {
    const broken = cellDoorPo({ shape: 'ellipse', points: null, width: '2.00' });
    expect(() => toWallDto(broken)).toThrow(
      expect.objectContaining({
        message: expect.stringContaining(`wall ${CELL_DOOR_ID} was saved broken`),
        cause: expect.any(RangeError),
      }),
    );
  });
});

describe('wallOfRow', () => {
  it('a row becomes the game-core wall in numbers', () => {
    expect(wallOfRow(cellDoorPo())).toMatchObject({ kind: 'door', x: 7, y: 5, height: 1 });
  });
});

describe('toNewWallPo', () => {
  it('a shape is rounded to the hundredth into numeric strings, with no door state', () => {
    const row = toNewWallPo(VHARN_SCENE_ID, newGrate({ x: 4.126, width: 2.004 }));
    expect(row).toEqual({
      sceneId: VHARN_SCENE_ID,
      kind: 'grate',
      shape: 'rectangle',
      x: '4.13',
      y: '4.00',
      width: '2.00',
      height: '2.00',
      points: null,
      doorState: null,
    });
  });

  it('a door is born closed and keeps its rounded points', () => {
    const door = newGrate({
      kind: 'door',
      shape: 'line',
      width: 0,
      height: 1,
      points: [
        [0, 0],
        [0, 1.004],
      ],
    });
    expect(toNewWallPo(VHARN_SCENE_ID, door)).toMatchObject({
      doorState: 'closed',
      points: [
        [0, 0],
        [0, 1],
      ],
    });
  });
});

describe('toWallMovePo', () => {
  it('a move is saved to the hundredth', () => {
    expect(toWallMovePo({ wallId: NORTH_WALL_ID, x: 7.125, y: 1 })).toEqual({
      wallId: NORTH_WALL_ID,
      x: '7.13',
      y: '1.00',
    });
  });
});
