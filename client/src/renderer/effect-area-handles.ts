import {
  effectAreaBounds,
  facingToward,
  facingVector,
  isSmoothArea,
  reachToward,
  resizeBox,
  snapFacing,
  turnEffectArea,
  type AimedArea,
  type EffectArea,
  type ResizeHandle,
  type SceneSize,
} from '@lorkarium/game-core';
import type { EffectAreaShapeDto } from '@lorkarium/contracts';
import { sentShapeOf } from '@/lib/effect-area-shape';
import type { BoardView } from './board-view';
import { CELL_WORLD_SIZE, type Point } from './camera';
import type { EffectAreaView } from './effect-area-view';
import { HANDLE_GAP, type FacingTarget } from './facing-handle';
import type { ResizeTarget } from './resize-handles';

const WHOLE_CELLS = { step: 1, min: 1, max: 100 } as const;
const SHIFT_STEP = 45;

/** The one area that shows the handles: selected alone (no token nor drawing with it), pickable,
 *  with Selecionar.
 *
 *  Example: `handleAreaOf(view)?.id` */
export function handleAreaOf(
  view: Pick<BoardView, 'effectAreas' | 'tokens' | 'drawings' | 'tool'>,
): EffectAreaView | null {
  if (view.tool !== 'select') return null;
  if (view.tokens.some(({ selected }) => selected)) return null;
  if (view.drawings.some(({ selected }) => selected)) return null;
  const selected = view.effectAreas.filter(({ selected }) => selected);
  const [only] = selected;
  return selected.length === 1 && only?.pickable ? only : null;
}

/** The area as a resize target: the squares sit on the box of the whole shape. The square
 *  stretches like a token (whole cells); every other shape changes its reach toward the pointer
 *  with its origin still (grid shapes in whole cells, smooth ones free, Shift = half a cell).
 *
 *  Example: `effectAreaResizeTarget(cone, scene).resized('se', start, now, false)` */
export function effectAreaResizeTarget(view: EffectAreaView, scene: SceneSize): ResizeTarget {
  const effectAreaId = view.id;
  const reshapedTo = (handle: ResizeHandle, start: Point, now: Point, snap: boolean) =>
    sentShapeOf(stretched(view.area, scene, handle, start, now, snap), view.color);
  return {
    id: effectAreaId,
    rect: worldRectOf(view.area),
    previewed: (handle, start, now, snap) => ({
      kind: 'effectAreaReshapePreviewed',
      effectAreaId,
      shape: reshapedTo(handle, start, now, snap),
    }),
    resized: (handle, start, now, snap) => ({
      kind: 'effectAreaReshaped',
      effectAreaId,
      shape: reshapedTo(handle, start, now, snap),
    }),
    cancelled: () => ({ kind: 'effectAreaReshapePreviewed', effectAreaId, shape: null }),
  };
}

/** The area as a facing target, when it points somewhere (cones, semicircles, the line): the
 *  handle sits past its reach in the direction it points. Cones snap to their own facings and
 *  pivot on the cell they leave; the line and the smooth semicircle turn freely (Shift: 45°).
 *
 *  Example: `effectAreaFacingTarget(cone)?.turned(135)` */
export function effectAreaFacingTarget(view: EffectAreaView): FacingTarget | null {
  const { area } = view;
  if (!('facing' in area)) return null;
  const effectAreaId = view.id;
  const pivot = pivotOf(area);
  const turnedTo = (facing: number): EffectAreaShapeDto =>
    sentShapeOf(turnEffectArea(area, facing), view.color);
  return {
    id: effectAreaId,
    facing: area.facing,
    stem: { from: pivot, to: handlePointOf(area, pivot) },
    facingAt: (pointer, current, snap) => {
      const toward = facingToward(pivot, pointer);
      if (toward === null) return current;
      const wanted = snap ? snapFacing(toward, SHIFT_STEP) : toward;
      const turned = turnEffectArea(area, wanted);
      return 'facing' in turned ? turned.facing : current;
    },
    previewed: (facing) => ({
      kind: 'effectAreaReshapePreviewed',
      effectAreaId,
      shape: facing === null ? null : turnedTo(facing),
    }),
    turned: (facing) => ({ kind: 'effectAreaReshaped', effectAreaId, shape: turnedTo(facing) }),
  };
}

function stretched(
  area: EffectArea,
  scene: SceneSize,
  handle: ResizeHandle,
  start: Point,
  now: Point,
  snap: boolean,
): EffectArea {
  if (area.kind === 'square') {
    const delta = {
      x: (now.x - start.x) / CELL_WORLD_SIZE,
      y: (now.y - start.y) / CELL_WORLD_SIZE,
    };
    const box = { col: area.x, row: area.y, width: area.width, height: area.height };
    const next = resizeBox(scene, box, handle, delta, WHOLE_CELLS);
    return { ...area, x: next.col, y: next.row, width: next.width, height: next.height };
  }
  if (!('reach' in area)) return area;
  const pointer = { x: now.x / CELL_WORLD_SIZE, y: now.y / CELL_WORLD_SIZE };
  const step = isSmoothArea(area) && snap ? 0.5 : 0;
  return { ...area, reach: reachToward(area, pointer, step) } as EffectArea;
}

// Cones turn around the center of the cell they leave; the other shapes around their origin.
function pivotOf(area: AimedArea): Point {
  const back =
    area.kind === 'diagonal_cone' ? Math.SQRT1_2 : area.kind === 'orthogonal_cone' ? 0.5 : 0;
  const ahead = facingVector(area.facing);
  const x = area.x - ahead.x * back;
  const y = area.y - ahead.y * back;
  return { x: x * CELL_WORLD_SIZE, y: y * CELL_WORLD_SIZE };
}

function handlePointOf(area: AimedArea, pivot: Point): Point {
  const ahead = facingVector(area.facing);
  const distance = area.reach * CELL_WORLD_SIZE + HANDLE_GAP;
  return { x: pivot.x + ahead.x * distance, y: pivot.y + ahead.y * distance };
}

function worldRectOf(area: EffectArea): { x: number; y: number; width: number; height: number } {
  const { x, y, width, height } = effectAreaBounds(area);
  return {
    x: x * CELL_WORLD_SIZE,
    y: y * CELL_WORLD_SIZE,
    width: width * CELL_WORLD_SIZE,
    height: height * CELL_WORLD_SIZE,
  };
}
