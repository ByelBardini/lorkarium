import { describe, expect, it } from 'vitest';
import {
  boxOfShape,
  toDrawingDto,
  toDrawingMovePo,
  toNewDrawingPo,
} from '../../../src/modules/drawings/drawings.mapper';
import { BIA_ID } from '../../support/campaigns-factories';
import { caioPathPo, newCircle, SQUARE_ID, squarePo } from '../../support/drawings-factories';
import { VHARN_SCENE_ID } from '../../support/scenes-factories';

describe('toDrawingDto', () => {
  it('a square row becomes the drawing clients see, numeric "2.50" read as 2.5', () => {
    expect(toDrawingDto(squarePo())).toEqual({
      id: SQUARE_ID,
      authorId: BIA_ID,
      kind: 'rectangle',
      x: 2.5,
      y: 3,
      width: 2,
      height: 2,
      fill: 'ember',
      stroke: 'gold',
      strokeWidth: 'medium',
    });
  });

  it('a freehand row carries its points and no fill', () => {
    const dto = toDrawingDto(caioPathPo());

    expect(dto).toMatchObject({
      kind: 'freehand',
      points: [
        [0, 0],
        [1, 1],
        [2, 0.5],
      ],
    });
    expect(dto).not.toHaveProperty('fill');
  });

  it('a freehand row with no points saved is a broken row and throws citing the drawing', () => {
    expect(() => toDrawingDto(caioPathPo({ points: null }))).toThrow(
      /freehand drawing .* no points/,
    );
  });
});

describe('toNewDrawingPo', () => {
  it('a circle becomes the row to insert, with the author from the connection and numeric strings', () => {
    expect(toNewDrawingPo(VHARN_SCENE_ID, BIA_ID, newCircle({ x: 4.333 }))).toEqual({
      sceneId: VHARN_SCENE_ID,
      authorId: BIA_ID,
      kind: 'ellipse',
      x: '4.33',
      y: '4.00',
      width: '2.00',
      height: '2.00',
      points: null,
      fill: null,
      stroke: 'violet',
      strokeWidth: 'thick',
    });
  });

  it('a freehand path keeps its points rounded to the hundredth and no fill', () => {
    const path = {
      kind: 'freehand',
      x: 1,
      y: 1,
      width: 1,
      height: 1,
      points: [
        [0, 0],
        [0.3333, 1],
      ],
      stroke: 'ink',
      strokeWidth: 'thin',
    } as const;

    expect(
      toNewDrawingPo(VHARN_SCENE_ID, BIA_ID, {
        ...path,
        points: [
          [0, 0],
          [0.3333, 1],
        ],
      }),
    ).toMatchObject({
      points: [
        [0, 0],
        [0.33, 1],
      ],
      fill: null,
    });
  });
});

describe('boxOfShape and toDrawingMovePo', () => {
  it('the box of a sent shape is its corner and size', () => {
    expect(boxOfShape(newCircle())).toEqual({ x: 4, y: 4, width: 2, height: 2 });
  });

  it('a move becomes numeric strings rounded to the hundredth', () => {
    expect(toDrawingMovePo({ drawingId: SQUARE_ID, x: 7.125, y: 1 })).toEqual({
      drawingId: SQUARE_ID,
      x: '7.13',
      y: '1.00',
    });
  });
});
