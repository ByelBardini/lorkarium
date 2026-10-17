import { cell } from '@lorkarium/game-core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
  type DragGroup,
} from '@/stores/board-interaction-store';
import { DRAG_SEND_INTERVAL_MS } from '@/stores/token-drag-relay';
import { VHARN } from '../support/campaigns-api-fake';
import { InteractionClockFake } from '../support/interaction-clock-fake';
import { TableBoardCommandsFake } from '../support/table-board-commands-fake';
import { KAEL_ID, LYRA_ID } from '../support/table-session-fixtures';

const SCENE = { widthCells: 20, heightCells: 12 };
const LYRA_MEMBER = { tokenId: LYRA_ID, col: 3, row: 4, size: 1 };
// Lyra (the anchor) at (3, 4) and Kael at (5, 4), dragged together.
const PAIR: DragGroup = {
  scene: SCENE,
  members: [LYRA_MEMBER, { tokenId: KAEL_ID, col: 5, row: 4, size: 1 }],
};
const ORIGIN = cell(3, 4);

describe('dragging a group of tokens', () => {
  let store: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;
  let clock: InteractionClockFake;

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    clock = new InteractionClockFake();
    store = createBoardInteractionStore({
      campaignId: VHARN.id,
      commands,
      describeRefusal: (failure) => `recusado: ${failure}`,
      clock,
    });
  });

  function over(at: ReturnType<typeof cell> | null, group: DragGroup = PAIR): void {
    store.getState().dragOver(LYRA_ID, ORIGIN, at, group);
  }

  function dragsSent(): unknown[] {
    return commands.sentAs('dragTokens').map(({ fields }) => fields);
  }

  it('each step sends one group preview with the cell of every member, never one per token', () => {
    over(cell(4, 5));
    expect(dragsSent()).toEqual([
      {
        drags: [
          { tokenId: LYRA_ID, cell: { col: 4, row: 5 } },
          { tokenId: KAEL_ID, cell: { col: 6, row: 5 } },
        ],
      },
    ]);
  });

  it('steps closer than 100 ms collapse into the latest group preview', async () => {
    over(cell(4, 4));
    await Promise.resolve();
    over(cell(5, 4));
    over(cell(6, 4));
    expect(dragsSent()).toHaveLength(1);
    clock.advance(DRAG_SEND_INTERVAL_MS);
    expect(dragsSent().at(-1)).toEqual({
      drags: [
        { tokenId: LYRA_ID, cell: { col: 6, row: 4 } },
        { tokenId: KAEL_ID, cell: { col: 8, row: 4 } },
      ],
    });
  });

  it('the route and its ruler are the anchor’s, and the landing names every member', () => {
    over(cell(4, 5));
    expect(store.getState().drag).toMatchObject({
      anchorId: LYRA_ID,
      route: { origin: ORIGIN, current: cell(4, 5) },
      landing: [
        { tokenId: LYRA_ID, col: 4, row: 5 },
        { tokenId: KAEL_ID, col: 6, row: 5 },
      ],
    });
  });

  it('the drop sends one moveTokens with the landing, after the preview on its way', async () => {
    commands.hold();
    over(cell(4, 5));
    const dropped = store.getState().dropToken(LYRA_ID, cell(4, 5));
    expect(store.getState().preview).toEqual([
      { tokenId: LYRA_ID, col: 4, row: 5 },
      { tokenId: KAEL_ID, col: 6, row: 5 },
    ]);
    await Promise.resolve();
    expect(commands.sentAs('moveTokens')).toEqual([]);
    commands.release();
    await dropped;
    expect(commands.sentAs('moveTokens').map(({ fields }) => fields)).toEqual([
      {
        moves: [
          { tokenId: LYRA_ID, col: 4, row: 5 },
          { tokenId: KAEL_ID, col: 6, row: 5 },
        ],
      },
    ]);
    expect(commands.sentAs('moveToken')).toEqual([]);
  });

  it('a drop with a member off the scene moves nothing and ends the drag of every member', async () => {
    over(cell(4, 4));
    await Promise.resolve();
    await store.getState().dropToken(LYRA_ID, cell(18, 4));
    expect(commands.sentAs('moveTokens')).toEqual([]);
    expect(dragsSent().at(-1)).toEqual({
      drags: [
        { tokenId: LYRA_ID, cell: null },
        { tokenId: KAEL_ID, cell: null },
      ],
    });
    expect(store.getState().drag).toBeNull();
  });

  it('a step that would push a member off the scene sends nothing and lands nowhere', () => {
    over(cell(18, 4));
    expect(dragsSent()).toEqual([]);
    expect(store.getState().drag?.landing).toBeNull();
  });

  it('a refused group move drops every ghost and says why', async () => {
    commands.answerWith({ ok: false, failure: 'forbidden' });
    over(cell(4, 5));
    await store.getState().dropToken(LYRA_ID, cell(4, 5));
    expect(store.getState()).toMatchObject({ preview: [], notice: 'recusado: forbidden' });
  });

  it('a token dragged alone is dropped with a single moveToken, as before', async () => {
    const alone: DragGroup = { scene: SCENE, members: [LYRA_MEMBER] };
    over(cell(4, 5), alone);
    await store.getState().dropToken(LYRA_ID, cell(4, 5));
    expect(commands.sentAs('moveToken').map(({ fields }) => fields)).toEqual([
      { tokenId: LYRA_ID, col: 4, row: 5 },
    ]);
    expect(commands.sentAs('moveTokens')).toEqual([]);
  });
});
