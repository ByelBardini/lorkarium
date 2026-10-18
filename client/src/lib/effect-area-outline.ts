import type { EffectArea, GridCell, Vector2 } from '@lorkarium/game-core';

/** One side of a cell, in cells: from one grid intersection to the next. */
export type CellEdge = Readonly<{ from: Vector2; to: Vector2 }>;

const SMOOTH_SEGMENTS = 64;

/** The outline of painted cells: only the sides no other painted cell shares, so the solid line
 *  follows the edge of the whole area and never crosses it.
 *
 *  Example: `cellEdgesOf([{ col: 0, row: 0 }, { col: 1, row: 0 }]).length // 6` */
export function cellEdgesOf(cells: readonly GridCell[]): CellEdge[] {
  const painted = new Set(cells.map(keyOf));
  const has = (col: number, row: number): boolean => painted.has(`${col},${row}`);
  return cells.flatMap(({ col, row }) => {
    const edges: CellEdge[] = [];
    if (!has(col, row - 1)) edges.push(edge(col, row, col + 1, row));
    if (!has(col + 1, row)) edges.push(edge(col + 1, row, col + 1, row + 1));
    if (!has(col, row + 1)) edges.push(edge(col, row + 1, col + 1, row + 1));
    if (!has(col - 1, row)) edges.push(edge(col, row, col, row + 1));
    return edges;
  });
}

/** The outline of a smooth shape as a closed polygon in cells: the whole circle, or the arc of a
 *  semicircle from one end of its diameter to the other (closing the polygon draws the diameter).
 *
 *  Example: `smoothOutlineOf(smoothCircle)[0] // the point on the right of the center` */
export function smoothOutlineOf(area: EffectArea): Vector2[] {
  if (!('reach' in area)) return [];
  const half = area.kind === 'smooth_semicircle' || area.kind === 'semicircle';
  const facing = 'facing' in area ? area.facing : 0;
  const start = half ? facing - 90 : 0;
  const sweep = half ? 180 : 360;
  const steps = half ? SMOOTH_SEGMENTS / 2 : SMOOTH_SEGMENTS;
  const last = half ? steps : steps - 1;
  return Array.from({ length: last + 1 }, (_, index) => {
    const toward = vectorAt(start + (sweep * index) / steps);
    return { x: area.x + toward.x * area.reach, y: area.y + toward.y * area.reach };
  });
}

function vectorAt(degrees: number): Vector2 {
  const radians = (degrees * Math.PI) / 180;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}

function edge(fromCol: number, fromRow: number, toCol: number, toRow: number): CellEdge {
  return { from: { x: fromCol, y: fromRow }, to: { x: toCol, y: toRow } };
}

function keyOf({ col, row }: GridCell): string {
  return `${col},${row}`;
}
