import { cell } from '@lorkarium/game-core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import type { EditEntry } from '@/lib/edit-history';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { PATH_ID, path, SQUARE_ID, square } from '../support/drawing-fixtures';
import { TableBoardCommandsFake } from '../support/table-board-commands-fake';
import { LYRA_ID, VHARN_GRID } from '../support/table-session-fixtures';

const SQUARE_TO_6_1 = { drawingId: SQUARE_ID, from: { x: 2.5, y: 3 }, to: { x: 6, y: 1 } };
const LYRA_TO_7_2 = { tokenId: LYRA_ID, from: cell(3, 4), to: cell(7, 2) };

describe('moving and deleting drawings', () => {
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

  it('dragging the square with Lyra selected sends one moveDrawings and one moveTokens', async () => {
    await store.getState().moveSelection({ drawings: [SQUARE_TO_6_1], tokens: [LYRA_TO_7_2] });

    expect(commands.sentAs('moveDrawings')[0]?.fields).toEqual({
      moves: [{ drawingId: SQUARE_ID, x: 6, y: 1 }],
    });
    expect(commands.sentAs('moveTokens')[0]?.fields).toEqual({
      moves: [{ tokenId: LYRA_ID, col: 7, row: 2 }],
    });
  });

  it('the drag is one entry on the undo stack with both moves', async () => {
    await store.getState().moveSelection({ drawings: [SQUARE_TO_6_1], tokens: [LYRA_TO_7_2] });

    expect(recorded).toEqual([
      [
        { kind: 'drawingsMoved', moves: [SQUARE_TO_6_1] },
        { kind: 'tokensMoved', moves: [LYRA_TO_7_2] },
      ],
    ]);
  });

  it('the square shows where it goes until the server answers, then the preview clears', async () => {
    commands.hold();

    const moving = store.getState().moveSelection({ drawings: [SQUARE_TO_6_1], tokens: [] });
    expect(store.getState().drawingPreview).toEqual([{ drawingId: SQUARE_ID, x: 6, y: 1 }]);
    commands.release();
    await moving;

    expect(store.getState().drawingPreview).toEqual([]);
  });

  it('a refused move puts the square back, says why and records nothing', async () => {
    commands.answerWith({ ok: false, failure: 'forbidden' });

    await store.getState().moveSelection({ drawings: [SQUARE_TO_6_1], tokens: [] });

    expect(store.getState()).toMatchObject({ drawingPreview: [], notice: 'recusado: forbidden' });
    expect(recorded).toEqual([]);
  });

  it('Delete with two drawings selected is one deleteDrawings, recorded with their shapes', async () => {
    store
      .getState()
      .pointer({ kind: 'drawingsMarqueed', drawingIds: [SQUARE_ID, PATH_ID], additive: false });

    await store.getState().deleteDrawings([square(), path()]);

    expect(commands.sentAs('deleteDrawings')[0]?.fields).toMatchObject({
      drawingIds: [SQUARE_ID, PATH_ID],
    });
    expect(recorded[0]?.[0]).toMatchObject({
      kind: 'drawingsRemoved',
      drawings: [
        { id: SQUARE_ID, shape: { kind: 'rectangle', x: 2.5 } },
        { id: PATH_ID, shape: { kind: 'freehand', x: 1 } },
      ],
    });
    expect(store.getState().selectedDrawingIds).toEqual([]);
  });

  it('while reconnecting nothing is moved nor deleted', async () => {
    store.getState().setReadOnly(true);

    await store.getState().moveSelection({ drawings: [SQUARE_TO_6_1], tokens: [] });
    await store.getState().deleteDrawings([square()]);

    expect(commands.sent).toEqual([]);
  });
});
