import type { EditEntry } from '@/lib/edit-history';
import type { LightPoint, LightReach } from '@/services/light-commands';
import type { BoardCommandFailure, TableBoardCommands } from '@/services/table-board-commands';

export type LightToolDeps = Readonly<{
  campaignId: string;
  commands: TableBoardCommands;
  describeRefusal: (failure: BoardCommandFailure) => string;
  /** The confirmed light goes on this user's undo stack. */
  recordEdit: (entry: EditEntry) => void;
}>;

/** How the light is placed: the remembered reach, and whether the table is read only right now. */
export type LightToolContext = Readonly<{
  reach: LightReach;
  readOnly: boolean;
  say: (notice: string) => void;
}>;

/** A click of the lights tool becomes one `createLights` at the point with the remembered reach:
 *  the light shows when its event arrives; confirmed, it goes on the undo stack (by the id the
 *  server gave); refused, the status line says why. Read only sends nothing.
 *
 *  Example: `await sendLight(deps, { x: 5.5, y: 3 }, { reach, readOnly, say })` */
export async function sendLight(
  deps: LightToolDeps,
  point: LightPoint,
  context: LightToolContext,
): Promise<void> {
  if (context.readOnly) return;
  const placement = { x: point.x, y: point.y, ...context.reach };
  const result = await deps.commands.createLights(deps.campaignId, [placement]);
  if (!result.ok) return context.say(deps.describeRefusal(result.failure));
  const [id] = result.createdIds ?? [];
  if (id) deps.recordEdit([{ kind: 'lightsAdded', lights: [{ id, placement }] }]);
}
