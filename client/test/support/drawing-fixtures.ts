import type { DrawingDto } from '@lorkarium/contracts';
import { VHARN } from './campaigns-api-fake';
import { BIA_AT_TABLE, CAIO_AT_TABLE } from './table-session-fixtures';

export const SQUARE_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
export const PATH_ID = 'd2e3f4a5-b6c7-4d8e-9f0a-1b2c3d4e5f6a';
const AT = '2026-10-16T12:00:00.000Z';

/** Bia's filled square at VHARN: (2.5, 3), 2×2, gold stroke, ember fill, on the tokens layer.
 *
 *  Example: `vharnBoard({ drawings: [square({ layer: 'objects' })] })` */
export function square(overrides: Partial<DrawingDto> = {}): DrawingDto {
  return {
    id: SQUARE_ID,
    authorId: BIA_AT_TABLE.userId,
    kind: 'rectangle',
    x: 2.5,
    y: 3,
    width: 2,
    height: 2,
    fill: 'ember',
    stroke: 'gold',
    strokeWidth: 'medium',
    layer: 'tokens',
    ...overrides,
  } as DrawingDto;
}

/** Caio's freehand path at VHARN: (1, 1), 2×1, three points, moss, thin.
 *
 *  Example: `vharnBoard({ drawings: [square(), path()] })` */
export function path(overrides: Partial<DrawingDto> = {}): DrawingDto {
  return {
    id: PATH_ID,
    authorId: CAIO_AT_TABLE.userId,
    kind: 'freehand',
    x: 1,
    y: 1,
    width: 2,
    height: 1,
    points: [
      [0, 0],
      [1, 1],
      [2, 0.5],
    ],
    stroke: 'moss',
    strokeWidth: 'thin',
    layer: 'tokens',
    ...overrides,
  } as DrawingDto;
}

/** The fields every board event of VHARN carries at `version`. */
export function vharnEventBase(
  version: number,
): Readonly<{ campaignId: string; version: number; at: string }> {
  return { campaignId: VHARN.id, version, at: AT };
}
