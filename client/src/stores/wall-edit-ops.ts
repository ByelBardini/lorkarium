import type { BoardScope } from '@/services/board-command-sender';
import type { EditOp } from '@/lib/edit-history';
import type { TableBoardCommands } from '@/services/table-board-commands';
import { createdIdsOf, type EditOpResult } from './effect-area-edit-ops';

type WallOp = Extract<EditOp, { kind: 'wallsAdded' | 'wallsRemoved' | 'wallsKindChanged' }>;

/** One wall op as its command: creating answers the new ids; removing and changing the kind
 *  send where (or what) each wall must still be, so the server refuses (`stale_undo`) when
 *  someone changed it.
 *
 *  Example: `await runWallOp(op, scope, commands)` */
export async function runWallOp(
  op: WallOp,
  scope: BoardScope,
  commands: TableBoardCommands,
): Promise<EditOpResult> {
  switch (op.kind) {
    case 'wallsAdded': {
      const result = await commands.createWalls(
        scope,
        op.walls.map(({ shape }) => shape),
      );
      return createdIdsOf(
        result,
        op.walls.map(({ id }) => id),
      );
    }
    case 'wallsRemoved': {
      const ids = op.walls.map(({ id }) => id);
      const expect = op.walls.map(({ id, shape }) => ({ wallId: id, x: shape.x, y: shape.y }));
      return createdIdsOf(await commands.deleteWalls(scope, ids, expect), []);
    }
    case 'wallsKindChanged':
      return runKindChange(op, scope, commands);
  }
}

// One command per kind asked: a group always shares its kind, and so does its inverse only
// when every wall had the same one before.
async function runKindChange(
  op: Extract<WallOp, { kind: 'wallsKindChanged' }>,
  scope: BoardScope,
  commands: TableBoardCommands,
): Promise<EditOpResult> {
  const kinds = [...new Set(op.changes.map(({ to }) => to))];
  for (const kind of kinds) {
    const changes = op.changes.filter(({ to }) => to === kind);
    const ids = changes.map(({ wallId }) => wallId);
    const expect = changes.map(({ wallId, from }) => ({ wallId, kind: from }));
    const result = await commands.setWallKinds(scope, ids, kind, expect);
    if (!result.ok) return createdIdsOf(result, []);
  }
  return { ok: true, mapping: {} };
}
