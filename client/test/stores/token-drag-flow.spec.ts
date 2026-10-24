import { cell } from '@lorkarium/game-core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
  type DragGroup,
} from '@/stores/board-interaction-store';
import { DRAG_SEND_INTERVAL_MS } from '@/stores/token-drag-relay';
import { InteractionClockFake } from '../support/interaction-clock-fake';
import { TableBoardCommandsFake } from '../support/table-board-commands-fake';
import { KAEL_ID, LYRA_ID, VHARN_GRID } from '../support/table-session-fixtures';
import { wall } from '@lorkarium/game-core';

const SCENE = { widthCells: 20, heightCells: 12 };
const LYRA_MEMBER = { tokenId: LYRA_ID, col: 3, row: 4, width: 1, height: 1 };
// Lyra (the anchor) at (3, 4) and Kael at (5, 4), dragged together.
const PAIR: DragGroup = {
  scene: SCENE,
  members: [LYRA_MEMBER, { tokenId: KAEL_ID, col: 5, row: 4, width: 1, height: 1 }],
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
      scopeOf: () => VHARN_GRID,
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

describe('dragging past walls', () => {
  // A wall down x = 5 from y = 0 to 6: Lyra at (3, 4) gets around it below.
  const WALL_AT_5 = wall({
    kind: 'wall',
    shape: 'line',
    x: 5,
    y: 0,
    width: 0,
    height: 6,
    points: [
      [0, 0],
      [0, 6],
    ],
    doorState: null,
  });
  let store: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    store = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: (failure) => `recusado: ${failure}`,
      clock: new InteractionClockFake(),
    });
  });

  it('a drop around the wall sends moveToken with the bend of the route', async () => {
    const alone: DragGroup = { scene: SCENE, members: [LYRA_MEMBER], walls: [WALL_AT_5] };
    store.getState().dragOver(LYRA_ID, ORIGIN, cell(3, 7), alone);
    store.getState().dragOver(LYRA_ID, ORIGIN, cell(7, 7), alone);
    store.getState().dragOver(LYRA_ID, ORIGIN, cell(7, 4), alone);

    await store.getState().dropToken(LYRA_ID, cell(7, 4));

    expect(commands.sentAs('moveToken').map(({ fields }) => fields)).toEqual([
      { tokenId: LYRA_ID, col: 7, row: 4, path: [{ col: 3, row: 7 }] },
    ]);
  });

  it('a drag straight into the wall stops on her own cell: nothing is sent and the wall is said', async () => {
    const alone: DragGroup = { scene: SCENE, members: [LYRA_MEMBER], walls: [WALL_AT_5] };
    store.getState().dragOver(LYRA_ID, ORIGIN, cell(4, 4), alone);
    store.getState().dragOver(LYRA_ID, ORIGIN, cell(5, 4), alone);
    store.getState().dragOver(LYRA_ID, ORIGIN, cell(6, 4), alone);

    await store.getState().dropToken(LYRA_ID, cell(6, 4));

    expect(commands.sentAs('moveToken').map(({ fields }) => fields)).toEqual([
      { tokenId: LYRA_ID, col: 4, row: 4 },
    ]);
    expect(store.getState().notice).toBe('recusado: wall_blocked');
  });

  it('a drag that never gets past the wall from its start sends nothing and says the wall', async () => {
    const beside: DragGroup = {
      scene: SCENE,
      members: [{ ...LYRA_MEMBER, col: 4 }],
      walls: [WALL_AT_5],
    };
    store.getState().dragOver(LYRA_ID, cell(4, 4), cell(5, 4), beside);
    store.getState().dragOver(LYRA_ID, cell(4, 4), cell(6, 4), beside);

    await store.getState().dropToken(LYRA_ID, cell(6, 4));

    expect(commands.sent.filter(({ name }) => name !== 'dragTokens')).toEqual([]);
    expect(store.getState().notice).toBe('recusado: wall_blocked');
  });

  it('a group where one member would cross the wall sends nothing and says the wall blocks it', async () => {
    // Kael at (4, 2) would go from (4, 2) to (6, 2), right through the wall.
    const pair: DragGroup = {
      scene: SCENE,
      members: [LYRA_MEMBER, { tokenId: KAEL_ID, col: 4, row: 2, width: 1, height: 1 }],
      walls: [WALL_AT_5],
    };
    store.getState().dragOver(LYRA_ID, ORIGIN, cell(3, 7), pair);
    store.getState().dragOver(LYRA_ID, ORIGIN, cell(5, 7), pair);
    store.getState().dragOver(LYRA_ID, ORIGIN, cell(5, 4), pair);

    await store.getState().dropToken(LYRA_ID, cell(5, 4));

    expect(commands.sentAs('moveTokens')).toEqual([]);
    expect(store.getState().notice).toBe('recusado: wall_blocked');
  });
});
