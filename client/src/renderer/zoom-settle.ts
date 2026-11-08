/** What the zoom asks of the overlays this frame: nothing new (`idle`), keep the scaled world
 *  while the gesture goes on (`wait`), or draw them again at the current zoom (`redraw`). */
export type ZoomSettle = 'idle' | 'wait' | 'redraw';

/** How long the zoom stays still before what depends on it is drawn again. */
export const ZOOM_SETTLE_MS = 120;

/** How far (by ratio, in or out) the zoom may drift from the drawn one before a redraw mid-gesture:
 *  scaled further, the lines would look too thick or too thin. One button step is exactly this. */
export const ZOOM_DRIFT_RATIO = 1.25;

// 1 / 1.25 in floating point gives back 1.2499999999999998 as the ratio.
const RATIO_SLACK = 1e-9;

export type ZoomSettleInput = Readonly<{ drawnZoom: number; zoom: number; stillForMs: number }>;

/** Whether the overlays, strips and grid follow the zoom now: the way maps do it, the gesture only
 *  scales the world and the lines are drawn again once it stops (or drifts too far).
 *
 *  Example: `zoomSettleOf({ drawnZoom: 1, zoom: 1.1, stillForMs: 130 }) // 'redraw'` */
export function zoomSettleOf({ drawnZoom, zoom, stillForMs }: ZoomSettleInput): ZoomSettle {
  assertZoom(drawnZoom);
  assertZoom(zoom);
  if (zoom === drawnZoom) return 'idle';
  const ratio = Math.max(zoom / drawnZoom, drawnZoom / zoom);
  if (ratio >= ZOOM_DRIFT_RATIO - RATIO_SLACK) return 'redraw';
  return stillForMs >= ZOOM_SETTLE_MS ? 'redraw' : 'wait';
}

function assertZoom(zoom: number): void {
  if (zoom > 0) return;
  throw new Error(`got zoom ${zoom}; expected a number with zoom > 0`);
}
