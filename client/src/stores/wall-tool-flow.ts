import type { WallDto } from '@lorkarium/contracts';
import type { SceneSize } from '@lorkarium/game-core';
import type { EditEntry } from '@/lib/edit-history';
import { wallSketchOf, wallVerticesOf } from '@/lib/wall-sketch';
import type { WallStyle } from '@/lib/wall-style';
import type { BoardCommandFailure, TableBoardCommands } from '@/services/table-board-commands';
import type { FinishedSketch } from './drawing-tool-flow';

export type WallToolDeps = Readonly<{
  campaignId: string;
  commands: TableBoardCommands;
  describeRefusal: (failure: BoardCommandFailure) => string;
  /** The confirmed wall goes on this user's undo stack. */
  recordEdit: (entry: EditEntry) => void;
}>;

/** Where the wall is drawn: its style, the walls already there (a near end glues to them), the
 *  scene it stays in, and whether the table is read only right now. */
export type WallToolContext = Readonly<{
  style: WallStyle;
  walls: readonly WallDto[];
  scene: SceneSize;
  readOnly: boolean;
  say: (notice: string) => void;
}>;

/** A drag of the walls tool becomes one `createWalls`: the wall shows when its event arrives;
 *  confirmed, it goes on the undo stack (by the id the server gave); refused, the status line says
 *  why. Read only, or a drag with no length, sends nothing.
 *
 *  Example: `await sendWall(deps, { points, snap }, { style, walls, scene, readOnly, say })` */
export async function sendWall(
  deps: WallToolDeps,
  sketch: FinishedSketch,
  context: WallToolContext,
): Promise<void> {
  if (context.readOnly) return;
  const shape = wallSketchOf({
    style: context.style,
    points: sketch.points,
    snap: sketch.snap,
    vertices: wallVerticesOf(context.walls),
    scene: context.scene,
  });
  if (!shape) return;
  const result = await deps.commands.createWalls(deps.campaignId, [shape]);
  if (!result.ok) return context.say(deps.describeRefusal(result.failure));
  const [id] = result.createdIds ?? [];
  if (id) deps.recordEdit([{ kind: 'wallsAdded', walls: [{ id, shape }] }]);
}
