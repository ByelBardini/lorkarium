import type { DrawingShapeDto } from '@lorkarium/contracts';
import type { DrawingPo } from '../../src/modules/drawings/drawings.po';
import { BIA_ID, CAIO_ID } from './campaigns-factories';
import { VHARN_SCENE_ID } from './scenes-factories';

export const SQUARE_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
export const PATH_ID = 'd2e3f4a5-b6c7-4d8e-9f0a-1b2c3d4e5f6a';

const CREATED = new Date('2026-10-16T12:00:00Z');

/** Bia's filled square on the VHARN scene: (2.5, 3), 2×2, on the tokens layer.
 *
 *  Example: `squarePo({ layer: 'objects' })` */
export function squarePo(overrides: Partial<DrawingPo> = {}): DrawingPo {
  return {
    id: SQUARE_ID,
    sceneId: VHARN_SCENE_ID,
    authorId: BIA_ID,
    drawOrder: 1,
    layer: 'tokens',
    kind: 'rectangle',
    x: '2.50',
    y: '3.00',
    width: '2.00',
    height: '2.00',
    points: null,
    stroke: 'gold',
    fill: 'ember',
    strokeWidth: 'medium',
    createdAt: CREATED,
    ...overrides,
  };
}

/** Caio's freehand path on the VHARN scene: (1, 1), 2×1, three points.
 *
 *  Example: `new DrawingsDaoFake(journal, [squarePo(), caioPathPo()])` */
export function caioPathPo(overrides: Partial<DrawingPo> = {}): DrawingPo {
  return squarePo({
    id: PATH_ID,
    authorId: CAIO_ID,
    drawOrder: 2,
    kind: 'freehand',
    x: '1.00',
    y: '1.00',
    width: '2.00',
    height: '1.00',
    points: [
      [0, 0],
      [1, 1],
      [2, 0.5],
    ],
    stroke: 'moss',
    fill: null,
    strokeWidth: 'thin',
    ...overrides,
  });
}

/** A circle as its author sends it: (4, 4), 2×2, no fill.
 *
 *  Example: `service.createMany(BIA_ID, VHARN_ID, { drawings: [newCircle({ layer: 'objects' })] })` */
export function newCircle(overrides: Partial<DrawingShapeDto> = {}): DrawingShapeDto {
  return {
    kind: 'ellipse',
    x: 4,
    y: 4,
    width: 2,
    height: 2,
    fill: null,
    stroke: 'violet',
    strokeWidth: 'thick',
    layer: 'tokens',
    ...overrides,
  } as DrawingShapeDto;
}
