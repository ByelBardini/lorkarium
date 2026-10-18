import type { EffectAreaShapeDto } from '@lorkarium/contracts';
import type { EditEntry } from '@/lib/edit-history';
import type { BoardCommandFailure, TableBoardCommands } from '@/services/table-board-commands';

export type EffectAreaToolDeps = Readonly<{
  campaignId: string;
  commands: TableBoardCommands;
  describeRefusal: (failure: BoardCommandFailure) => string;
  /** The confirmed area goes on this user's undo stack. */
  recordEdit: (entry: EditEntry) => void;
}>;

export type EffectAreaToolContext = Readonly<{
  readOnly: boolean;
  say: (notice: string) => void;
}>;

/** The area the tool drew becomes one `createEffectAreas`: it shows when its event arrives;
 *  confirmed, it goes on the undo stack (by the id the server gave); refused, the status line
 *  says why. Read only, nothing is sent.
 *
 *  Example: `await sendEffectArea(deps, shape, { readOnly, say })` */
export async function sendEffectArea(
  deps: EffectAreaToolDeps,
  shape: EffectAreaShapeDto,
  context: EffectAreaToolContext,
): Promise<void> {
  if (context.readOnly) return;
  const result = await deps.commands.createEffectAreas(deps.campaignId, [shape]);
  if (!result.ok) return context.say(deps.describeRefusal(result.failure));
  const [id] = result.createdIds ?? [];
  if (id) deps.recordEdit([{ kind: 'effectAreasAdded', effectAreas: [{ id, shape }] }]);
}
