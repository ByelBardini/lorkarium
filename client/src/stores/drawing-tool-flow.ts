import type { DrawingShapeInput, TokenLayerDto } from '@lorkarium/contracts';
import { sketchOf, type CellPoint, type SketchGeometry } from '@/lib/drawing-geometry';
import type { DrawingStyle } from '@/lib/drawing-style';
import type { EditEntry } from '@/lib/edit-history';
import type { BoardCommandFailure, TableBoardCommands } from '@/services/table-board-commands';

export type SketchDeps = Readonly<{
  campaignId: string;
  commands: TableBoardCommands;
  describeRefusal: (failure: BoardCommandFailure) => string;
  /** The confirmed drawing goes on this user's undo stack. */
  recordEdit: (entry: EditEntry) => void;
}>;

/** Where the sketch is drawn and how: the style, the layer (a player is always on `tokens`, the
 *  master on the active one) and whether the table is read only right now. */
export type SketchContext = Readonly<{
  style: DrawingStyle;
  layer: TokenLayerDto;
  readOnly: boolean;
  say: (notice: string) => void;
}>;

/** A sketch of the draw tool, released: the pointer points (cells) and Shift. */
export type FinishedSketch = Readonly<{ points: readonly CellPoint[]; snap: boolean }>;

/** The finished sketch becomes one `createDrawings`: the drawing shows when its event arrives;
 *  confirmed, it goes on the undo stack; refused, the status line says why. Read only, or a
 *  sketch with nothing to show, sends nothing.
 *
 *  Example: `await sendSketch(deps, { points, snap }, { style, layer, readOnly, say })` */
export async function sendSketch(
  deps: SketchDeps,
  sketch: FinishedSketch,
  context: SketchContext,
): Promise<void> {
  if (context.readOnly) return;
  const geometry = sketchOf(context.style.kind, sketch.points, sketch.snap);
  if (!geometry) return;
  const shape = shapeInputOf(geometry, context.style, context.layer);
  const result = await deps.commands.createDrawings(deps.campaignId, [shape]);
  if (!result.ok) return context.say(deps.describeRefusal(result.failure));
  const [id] = result.createdIds ?? [];
  if (id) deps.recordEdit([{ kind: 'drawingsAdded', drawings: [{ id, shape }] }]);
}

/** The geometry of a sketch with its style, as the command sends it: only fixed shapes fill.
 *
 *  Example: `shapeInputOf(sketchOf('ellipse', points, false), style, 'tokens')` */
export function shapeInputOf(
  geometry: SketchGeometry,
  style: DrawingStyle,
  layer: TokenLayerDto,
): DrawingShapeInput {
  const paint = { stroke: style.stroke, strokeWidth: style.strokeWidth, layer };
  if (geometry.kind === 'freehand') return { ...geometry, ...paint };
  return { ...geometry, fill: style.fill, ...paint };
}
