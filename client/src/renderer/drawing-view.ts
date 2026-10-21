import type { DrawingColorDto, DrawingDto, StrokeWidthDto } from '@lorkarium/contracts';
import { hitsDrawing, type DrawingGeometry } from '@/lib/drawing-geometry';
import { CELL_WORLD_SIZE, type Point } from './camera';

/** What a press does with the draw tool: start a new stroke, or take the drawings. */
export type DrawMode = 'draw' | 'select';

/** A drawing as the canvas shows it. `pickable`: a click or a marquee may take it — only with the
 *  draw tool in Selecionar, by its author or the master, and not while reconnecting. */
export type DrawingView = Readonly<{
  id: string;
  geometry: DrawingGeometry;
  stroke: DrawingColorDto;
  strokeWidth: StrokeWidthDto;
  pickable: boolean;
  selected: boolean;
  /** The confirmed drawing it came from: the canvas redraws a shape only when this changes. */
  source: DrawingDto;
}>;

/** Where a drawing move was asked to go, shown until the server answers. */
export type DrawingPreview = Readonly<{ drawingId: string; x: number; y: number }>;

export type DrawingViewInput = Readonly<{
  drawings: readonly DrawingDto[];
  viewer: Readonly<{ userId: string; isMaster: boolean }>;
  /** The draw tool in Selecionar: the only time a drawing is taken (tokens are left alone). */
  picking: boolean;
  selectedDrawingIds: readonly string[];
  drawingPreview: readonly DrawingPreview[];
  readOnly: boolean;
}>;

/** Confirmed drawings + local selection and moves → what the canvas draws, in drawing order.
 *
 *  Example: `drawingViewsOf({ drawings, viewer, picking, selectedDrawingIds, drawingPreview, readOnly })` */
export function drawingViewsOf(input: DrawingViewInput): DrawingView[] {
  return input.drawings.map((drawing) => viewOf(drawing, input));
}

/** The topmost pickable drawing under a world point, or `null`: the others cannot be taken.
 *
 *  Example: `const drawing = topDrawingAt(view.drawings, worldOf(event))` */
export function topDrawingAt(drawings: readonly DrawingView[], world: Point): DrawingView | null {
  const point = { x: world.x / CELL_WORLD_SIZE, y: world.y / CELL_WORLD_SIZE };
  const topFirst = [...drawings].reverse();
  return topFirst.find((view) => view.pickable && hitsDrawing(view.geometry, point)) ?? null;
}

function viewOf(drawing: DrawingDto, input: DrawingViewInput): DrawingView {
  const moved = input.drawingPreview.find(({ drawingId }) => drawingId === drawing.id);
  const at = moved ?? drawing;
  return {
    id: drawing.id,
    geometry: { ...geometryOf(drawing), x: at.x, y: at.y },
    stroke: drawing.stroke,
    strokeWidth: drawing.strokeWidth,
    pickable: mayPick(drawing, input),
    selected: input.selectedDrawingIds.includes(drawing.id),
    source: drawing,
  };
}

function mayPick(drawing: DrawingDto, { viewer, picking, readOnly }: DrawingViewInput): boolean {
  if (readOnly || !picking) return false;
  return viewer.isMaster || drawing.authorId === viewer.userId;
}

function geometryOf(drawing: DrawingDto): DrawingGeometry {
  const { x, y, width, height } = drawing;
  if (drawing.kind === 'freehand')
    return { kind: 'freehand', x, y, width, height, points: drawing.points };
  return { kind: drawing.kind, x, y, width, height, fill: drawing.fill };
}
