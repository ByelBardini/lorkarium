import type { BoardView } from './board-view';
import {
  effectAreaFacingTarget,
  effectAreaResizeTarget,
  handleAreaOf,
} from './effect-area-handles';
import { facingTargetOf, type FacingTarget } from './facing-handle';
import { resizeTargetOf, type ResizeTarget } from './resize-handles';

/** What shows the facing handle on the board: the one selected token, else the one selected area
 *  of effect that points somewhere.
 *
 *  Example: `boardFacingTargetOf(view)?.stem.to` */
export function boardFacingTargetOf(view: BoardView): FacingTarget | null {
  const token = facingTargetOf(view);
  if (token) return token;
  const area = handleAreaOf(view);
  return area ? effectAreaFacingTarget(area) : null;
}

/** What shows the eight squares on the board: the one selected token, else the one selected area.
 *
 *  Example: `boardResizeTargetOf(view)?.rect` */
export function boardResizeTargetOf(view: BoardView): ResizeTarget | null {
  const token = resizeTargetOf(view);
  if (token) return token;
  const area = handleAreaOf(view);
  return area ? effectAreaResizeTarget(area, view.grid.cells) : null;
}
