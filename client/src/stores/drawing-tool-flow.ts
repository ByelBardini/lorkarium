import type { BoardScope } from '@/services/board-command-sender';
import type { DrawingShapeInput } from '@lorkarium/contracts';
import { sketchOf, type CellPoint, type SketchGeometry } from '@/lib/drawing-geometry';
import type { DrawingStyle } from '@/lib/drawing-style';
import type { EditEntry } from '@/lib/edit-history';
import type { BoardCommandFailure, TableBoardCommands } from '@/services/table-board-commands';

export type SketchDeps = Readonly<{
  /** The grid its commands go to, read when each one is sent (the group grid can change). */
  scopeOf: () => BoardScope;
  commands: TableBoardCommands;
  describeRefusal: (failure: BoardCommandFailure) => string;
  /** The confirmed drawing goes on this user's undo stack. */
  recordEdit: (entry: EditEntry) => void;
}>;

/** How the sketch is drawn: the style, and whether the table is read only right now. */
export type SketchContext = Readonly<{
  style: DrawingStyle;
  readOnly: boolean;
  say: (notice: string) => void;
}>;

/** A sketch of the draw tool, released: the pointer points (cells) and Shift. */
export type FinishedSketch = Readonly<{ points: readonly CellPoint[]; snap: boolean }>;

/** The finished sketch becomes one `createDrawings`: the drawing shows when its event arrives;
 *  confirmed, it goes on the undo stack; refused, the status line says why. Read only, or a
 *  sketch with nothing to show, sends nothing.
 *
 *  Example: `await sendSketch(deps, { points, snap }, { style, readOnly, say })` */
export async function sendSketch(
  deps: SketchDeps,
  sketch: FinishedSketch,
  context: SketchContext,
): Promise<void> {
  if (context.readOnly) return;
  const geometry = sketchOf(context.style.kind, sketch.points, sketch.snap);
  if (!geometry) return;
  const shape = shapeInputOf(geometry, context.style);
  const result = await deps.commands.createDrawings(deps.scopeOf(), [shape]);
  if (!result.ok) return context.say(deps.describeRefusal(result.failure));
  const [id] = result.createdIds ?? [];
  if (id) deps.recordEdit([{ kind: 'drawingsAdded', drawings: [{ id, shape }] }]);
}

/** The geometry of a sketch with its style, as the command sends it: only fixed shapes fill.
 *
 *  Example: `shapeInputOf(sketchOf('ellipse', points, false), style)` */
export function shapeInputOf(geometry: SketchGeometry, style: DrawingStyle): DrawingShapeInput {
  const paint = { stroke: style.stroke, strokeWidth: style.strokeWidth };
  if (geometry.kind === 'freehand') return { ...geometry, ...paint };
  return { ...geometry, fill: style.fill, ...paint };
}
