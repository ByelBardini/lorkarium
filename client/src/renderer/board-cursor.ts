import type { BoardViewTool } from './board-view';
import type { WallMode } from './wall-view';
import type { DrawingKind } from '@/lib/drawing-geometry';

export type BoardCursorInput = Readonly<{
  tool: BoardViewTool;
  /** The kind the draw tool makes next; ignored with another tool. */
  drawKind: DrawingKind | null;
  /** The right button is dragging the camera. */
  panning: boolean;
  /** What a press does with the walls tool (absent: Desenhar). */
  wallMode?: WallMode;
}>;

// CSS has no pen or ruler keyword: small SVGs with the hotspot at the tip / the measuring edge.
function svgCursor(svg: string, x: number, y: number, fallback: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${x} ${y}, ${fallback}`;
}

const PEN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" ' +
  'stroke="black" stroke-width="1.5" stroke-linejoin="round"><path d="M3 21l1.5-5.5L16 4l4 4L8.5 ' +
  '19.5z"/><path d="M14 6l4 4" fill="none"/></svg>';

const RULER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" ' +
  'stroke="black" stroke-width="1.5" stroke-linejoin="round"><path d="M2 17L17 2l5 5L7 22z"/>' +
  '<path d="M6 13l2 2M9 10l3 3M12 7l2 2M15 4l3 3" fill="none"/></svg>';

export const PEN_CURSOR = svgCursor(PEN_SVG, 3, 21, 'crosshair');
export const RULER_CURSOR = svgCursor(RULER_SVG, 2, 17, 'crosshair');

const WALL_CURSOR: Readonly<Record<WallMode, string>> = {
  draw: 'crosshair',
  eraseArea: 'crosshair',
  eraseWall: 'pointer',
  eraseSegment: 'pointer',
};

/** The CSS cursor of the board: moving while the right button pans, a pen for freehand, a
 *  crosshair for the shapes, the area tool, drawing walls and the eraser box, a hand over walls to
 *  erase, a ruler while measuring, the default arrow otherwise.
 *
 *  Example: `canvas.style.cursor = boardCursorOf({ tool: 'draw', drawKind: 'freehand', panning: false })` */
export function boardCursorOf({ tool, drawKind, panning, wallMode }: BoardCursorInput): string {
  if (panning) return 'move';
  if (tool === 'ruler') return RULER_CURSOR;
  if (tool === 'walls') return WALL_CURSOR[wallMode ?? 'draw'];
  if (tool === 'area') return 'crosshair';
  if (tool !== 'draw') return 'default';
  return drawKind === 'freehand' ? PEN_CURSOR : 'crosshair';
}
