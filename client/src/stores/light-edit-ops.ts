import type { EditOp } from '@/lib/edit-history';
import type { TableBoardCommands } from '@/services/table-board-commands';
import { createdIdsOf, type EditOpResult } from './effect-area-edit-ops';

type LightOp = Extract<
  EditOp,
  { kind: 'lightsAdded' | 'lightsRemoved' | 'lightsMoved' | 'lightRangesChanged' }
>;

/** One light op as its command: placing answers the new ids; removing, moving and changing the
 *  reach send where (or how far) each light must still be, so the server refuses (`stale_undo`)
 *  when someone changed it.
 *
 *  Example: `await runLightOp(op, campaignId, commands)` */
export async function runLightOp(
  op: LightOp,
  campaignId: string,
  commands: TableBoardCommands,
): Promise<EditOpResult> {
  switch (op.kind) {
    case 'lightsAdded': {
      const placements = op.lights.map(({ placement }) => placement);
      const ids = op.lights.map(({ id }) => id);
      return createdIdsOf(await commands.createLights(campaignId, placements), ids);
    }
    case 'lightsRemoved': {
      const ids = op.lights.map(({ id }) => id);
      const expect = op.lights.map(({ id, placement: { x, y } }) => ({ lightId: id, x, y }));
      return createdIdsOf(await commands.deleteLights(campaignId, ids, expect), []);
    }
    case 'lightsMoved': {
      const moves = op.moves.map(({ lightId, from, to }) => ({ lightId, ...to, expect: from }));
      return createdIdsOf(await commands.moveLights(campaignId, moves), []);
    }
    case 'lightRangesChanged': {
      const changes = op.changes.map(({ lightId, from, to }) => ({ lightId, ...to, expect: from }));
      return createdIdsOf(await commands.setLightRanges(campaignId, changes), []);
    }
  }
}
