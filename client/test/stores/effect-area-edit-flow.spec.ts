import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import type { EditEntry } from '@/lib/edit-history';
import { shapeOfEffectArea } from '@/lib/effect-area-shape';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { SQUARE_ID } from '../support/drawing-fixtures';
import { ANA_CIRCLE_ID, BIA_CONE_ID, anaCircle, biaCone } from '../support/effect-area-fixtures';
import { TableBoardCommandsFake } from '../support/table-board-commands-fake';
import { VHARN_GRID } from '../support/table-session-fixtures';

const CONE = shapeOfEffectArea(biaCone());
const MOVED_CONE = { ...CONE, x: 7, y: 5 };
const CONE_MOVED = { effectAreaId: BIA_CONE_ID, from: CONE, to: MOVED_CONE };
const SQUARE_TO_6_1 = { drawingId: SQUARE_ID, from: { x: 2.5, y: 3 }, to: { x: 6, y: 1 } };

describe('moving, deleting and reshaping areas of effect', () => {
  let commands: TableBoardCommandsFake;
  let recorded: EditEntry[];
  let store: StoreApi<BoardInteractionStore>;

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    recorded = [];
    store = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: (failure) => `recusado: ${failure}`,
      recordEdit: (entry) => recorded.push(entry),
    });
  });

  it('a drag with a drawing and an area sends one moveDrawings and one reshapeEffectAreas', async () => {
    await store
      .getState()
      .moveSelection({ drawings: [SQUARE_TO_6_1], tokens: [], effectAreas: [CONE_MOVED] });

    expect(commands.sentAs('moveDrawings')).toHaveLength(1);
    expect(commands.sentAs('reshapeEffectAreas').map(({ fields }) => fields)).toEqual([
      { reshapes: [{ effectAreaId: BIA_CONE_ID, shape: MOVED_CONE }] },
    ]);
  });

  it('the confirmed drag is one entry on the undo stack with both changes', async () => {
    await store
      .getState()
      .moveSelection({ drawings: [SQUARE_TO_6_1], tokens: [], effectAreas: [CONE_MOVED] });

    expect(recorded).toEqual([
      [
        { kind: 'drawingsMoved', moves: [SQUARE_TO_6_1] },
        { kind: 'effectAreasReshaped', reshapes: [CONE_MOVED] },
      ],
    ]);
  });

  it('the area shows where it goes until the server answers, then the preview clears', async () => {
    commands.hold();
    const moving = store
      .getState()
      .moveSelection({ drawings: [], tokens: [], effectAreas: [CONE_MOVED] });

    expect(store.getState().effectAreaPreview).toEqual({ [BIA_CONE_ID]: MOVED_CONE });
    commands.release();
    await moving;
    expect(store.getState().effectAreaPreview).toEqual({});
  });

  it('a refused area move puts it back, says why and records nothing', async () => {
    commands.answerWith({ ok: false, failure: 'forbidden' });

    await store.getState().moveSelection({ drawings: [], tokens: [], effectAreas: [CONE_MOVED] });

    expect(store.getState()).toMatchObject({
      effectAreaPreview: {},
      notice: 'recusado: forbidden',
    });
    expect(recorded).toEqual([]);
  });

  it('Delete with two areas selected is one deleteEffectAreas, recorded with their shapes', async () => {
    store.getState().pointer({
      kind: 'effectAreasMarqueed',
      effectAreaIds: [BIA_CONE_ID, ANA_CIRCLE_ID],
      additive: true,
    });

    await store.getState().deleteEffectAreas([biaCone(), anaCircle()]);

    expect(commands.sentAs('deleteEffectAreas')[0]?.fields).toMatchObject({
      effectAreaIds: [BIA_CONE_ID, ANA_CIRCLE_ID],
    });
    expect(store.getState().selectedEffectAreaIds).toEqual([]);
    expect(recorded).toEqual([
      [
        {
          kind: 'effectAreasRemoved',
          effectAreas: [
            { id: BIA_CONE_ID, shape: CONE },
            { id: ANA_CIRCLE_ID, shape: shapeOfEffectArea(anaCircle()) },
          ],
        },
      ],
    ]);
  });

  it('a refused delete keeps the selection and says why', async () => {
    store
      .getState()
      .pointer({ kind: 'effectAreaPicked', effectAreaId: BIA_CONE_ID, additive: false });
    commands.answerWith({ ok: false, failure: 'effect_area_not_found' });

    await store.getState().deleteEffectAreas([biaCone()]);

    expect(store.getState()).toMatchObject({
      selectedEffectAreaIds: [BIA_CONE_ID],
      notice: 'recusado: effect_area_not_found',
    });
  });

  it('while reconnecting nothing is moved nor deleted', async () => {
    store.getState().setReadOnly(true);

    await store.getState().moveSelection({ drawings: [], tokens: [], effectAreas: [CONE_MOVED] });
    await store.getState().deleteEffectAreas([biaCone()]);

    expect(commands.sent).toEqual([]);
  });
});
