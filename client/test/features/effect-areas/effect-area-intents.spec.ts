import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { routeEffectAreaIntent } from '@/features/effect-areas/effect-area-intents';
import type { EditEntry } from '@/lib/edit-history';
import { shapeOfEffectArea } from '@/lib/effect-area-shape';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { BIA_CONE_ID, biaCone } from '../../support/effect-area-fixtures';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { vharnBoard, VHARN_GRID } from '../../support/table-session-fixtures';

const CONE = shapeOfEffectArea(biaCone());
const GROWN = { ...CONE, reach: 4 };

describe('routeEffectAreaIntent: the handles of an area', () => {
  let commands: TableBoardCommandsFake;
  let recorded: EditEntry[];
  let board: StoreApi<BoardStore>;
  let interaction: StoreApi<BoardInteractionStore>;

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    recorded = [];
    board = createBoardStore(VHARN.id, () => undefined);
    board.getState().apply({ kind: 'board', state: vharnBoard({ effectAreas: [biaCone()] }) });
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: (failure) => `recusado: ${failure}`,
      recordEdit: (entry) => recorded.push(entry),
    });
  });

  function route(intent: Parameters<typeof routeEffectAreaIntent>[1]): boolean {
    return routeEffectAreaIntent({ board, interaction }, intent);
  }

  it('a handle dragged shows the new shape at once, for this viewer only', () => {
    route({ kind: 'effectAreaReshapePreviewed', effectAreaId: BIA_CONE_ID, shape: GROWN });

    expect(interaction.getState().effectAreaPreview).toEqual({ [BIA_CONE_ID]: GROWN });
    expect(commands.sent).toEqual([]);
  });

  it('a handle released sends one reshapeEffectAreas with the new shape', async () => {
    route({ kind: 'effectAreaReshaped', effectAreaId: BIA_CONE_ID, shape: GROWN });

    await expect.poll(() => commands.sentAs('reshapeEffectAreas').length).toBe(1);
    expect(commands.sentAs('reshapeEffectAreas')[0]?.fields).toEqual({
      reshapes: [{ effectAreaId: BIA_CONE_ID, shape: GROWN }],
    });
  });

  it('confirmed, it goes on the undo stack and the status line reads the new size', async () => {
    route({ kind: 'effectAreaReshaped', effectAreaId: BIA_CONE_ID, shape: GROWN });

    await expect.poll(() => recorded.length).toBe(1);
    expect(recorded).toEqual([
      [
        {
          kind: 'effectAreasReshaped',
          reshapes: [{ effectAreaId: BIA_CONE_ID, from: CONE, to: GROWN }],
        },
      ],
    ]);
    expect(interaction.getState().notice).toBe('Cone diagonal agora tem 4 casas · 6 m.');
  });

  it('refused, the area goes back and the status line says why', async () => {
    commands.answerWith({ ok: false, failure: 'forbidden' });

    route({ kind: 'effectAreaReshaped', effectAreaId: BIA_CONE_ID, shape: GROWN });

    await expect.poll(() => interaction.getState().notice).toBe('recusado: forbidden');
    expect(interaction.getState().effectAreaPreview).toEqual({});
    expect(recorded).toEqual([]);
  });

  it('released on the shape it already had, nothing is sent and the preview clears', () => {
    route({ kind: 'effectAreaReshapePreviewed', effectAreaId: BIA_CONE_ID, shape: GROWN });

    route({ kind: 'effectAreaReshaped', effectAreaId: BIA_CONE_ID, shape: CONE });

    expect(commands.sent).toEqual([]);
    expect(interaction.getState().effectAreaPreview).toEqual({});
  });

  it('an intent of another kind is not routed here', () => {
    expect(route({ kind: 'pointerHovered', cell: null })).toBe(false);
  });
});
