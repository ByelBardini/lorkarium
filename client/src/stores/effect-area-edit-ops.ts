import type { EditOp, IdMapping } from '@/lib/edit-history';
import type {
  BoardCommandFailure,
  BoardCommandResult,
  TableBoardCommands,
} from '@/services/table-board-commands';

/** What running one op answered: the ids it created (old → new), or why it was refused. */
export type EditOpResult =
  | Readonly<{ ok: true; mapping: IdMapping }>
  | Readonly<{ ok: false; failure: BoardCommandFailure }>;

type EffectAreaOp = Extract<
  EditOp,
  { kind: 'effectAreasAdded' | 'effectAreasRemoved' | 'effectAreasReshaped' }
>;

/** Whether the op is about areas of effect (the edit store hands those to `runEffectAreaOp`). */
export function isEffectAreaOp(op: EditOp): op is EffectAreaOp {
  return (
    op.kind === 'effectAreasAdded' ||
    op.kind === 'effectAreasRemoved' ||
    op.kind === 'effectAreasReshaped'
  );
}

/** One area op as its command: creating answers the new ids; removing and reshaping send the
 *  shape each area must still have, so the server refuses (`stale_undo`) when someone changed it.
 *
 *  Example: `await runEffectAreaOp(op, campaignId, commands)` */
export async function runEffectAreaOp(
  op: EffectAreaOp,
  campaignId: string,
  commands: TableBoardCommands,
): Promise<EditOpResult> {
  switch (op.kind) {
    case 'effectAreasAdded': {
      const shapes = op.effectAreas.map(({ shape }) => shape);
      const result = await commands.createEffectAreas(campaignId, shapes);
      return createdIdsOf(
        result,
        op.effectAreas.map(({ id }) => id),
      );
    }
    case 'effectAreasRemoved': {
      const ids = op.effectAreas.map(({ id }) => id);
      const expect = op.effectAreas.map(({ id, shape }) => ({ effectAreaId: id, shape }));
      return createdIdsOf(await commands.deleteEffectAreas(campaignId, ids, expect), []);
    }
    case 'effectAreasReshaped': {
      const reshapes = op.reshapes.map(({ effectAreaId, from, to }) => ({
        effectAreaId,
        shape: to,
        expect: from,
      }));
      return createdIdsOf(await commands.reshapeEffectAreas(campaignId, reshapes), []);
    }
  }
}

/** The old ids, in the order sent, paired with the ids the server answered.
 *
 *  Example: `createdIdsOf(await commands.createDrawings(campaignId, shapes), oldIds)` */
export function createdIdsOf(result: BoardCommandResult, oldIds: readonly string[]): EditOpResult {
  if (!result.ok) return { ok: false, failure: result.failure };
  const newIds = result.createdIds ?? [];
  const mapping = Object.fromEntries(
    oldIds.flatMap((id, index) => {
      const newId = newIds[index];
      return newId ? [[id, newId] as const] : [];
    }),
  );
  return { ok: true, mapping };
}
