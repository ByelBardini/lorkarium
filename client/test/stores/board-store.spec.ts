import { beforeEach, describe, expect, it } from 'vitest';
import type { BoardEvent } from '@/services/board-events';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import type { StoreApi } from 'zustand/vanilla';
import { QUELM, VHARN } from '../support/campaigns-api-fake';
import { SQUARE_ID, square } from '../support/drawing-fixtures';
import {
  VHARN_SCENE,
  activeCondition,
  eventAt,
  KAEL_COMBATANT,
  KAEL_ID,
  groupDraggedOver,
  kael,
  LYRA_COMBATANT,
  LYRA_ID,
  tokenCreatedAt,
  tokenDeletedAt,
  tokenMovedAt,
  tokenUpdatedAt,
  lyra,
  sceneUpdated,
  vharnBoard,
  vharnCombat,
  VHARN_GRID,
  veiledLightsChanged,
} from '../support/table-session-fixtures';
import { biaCone } from '../support/effect-area-fixtures';
import { ESTRADA_SCENE, estradaBoard } from '../support/scene-tab-fixtures';
import { CORRIDOR_TORCH_ID, corridorTorch, veiledTorch } from '../support/light-fixtures';

const AT_OF_AREAS = '2026-10-18T12:00:00.000Z';

function sceneEvent(version: number, widthCells = 30): ReturnType<typeof boardEventOf> {
  return boardEventOf(sceneUpdated({ version, scene: { ...VHARN_SCENE, widthCells } }));
}

function boardEventOf(payload: ReturnType<typeof sceneUpdated>) {
  return { kind: 'boardEvent', event: { type: 'sceneUpdated', payload } } as const;
}

describe('board store', () => {
  let resyncs: number;
  let store: StoreApi<BoardStore>;

  beforeEach(() => {
    resyncs = 0;
    store = createBoardStore(VHARN.id, () => {
      resyncs += 1;
    });
  });

  function apply(...updates: Parameters<BoardStore['apply']>[0][]): void {
    for (const update of updates) store.getState().apply(update);
  }

  it('starts loading with no board', () => {
    expect(store.getState()).toMatchObject({ status: 'loading', board: null, failure: null });
  });

  it('a snapshot makes the board ready', () => {
    apply({ kind: 'board', state: vharnBoard() });
    expect(store.getState()).toMatchObject({ status: 'ready', board: vharnBoard() });
  });

  it('a snapshot always replaces the board, even one of a lower version', () => {
    apply({ kind: 'board', state: vharnBoard({ version: 9 }) });
    apply({ kind: 'board', state: vharnBoard({ version: 2 }) });
    expect(store.getState().board?.version).toBe(2);
  });

  it('an event one version above the board applies its scene and version', () => {
    apply({ kind: 'board', state: vharnBoard() }, sceneEvent(5));
    expect(store.getState().board).toMatchObject({ version: 5, scene: { widthCells: 30 } });
  });

  it('an event at or below the current version is a duplicate and is ignored', () => {
    apply({ kind: 'board', state: vharnBoard() }, sceneEvent(4), sceneEvent(3));
    expect(store.getState().board).toMatchObject({ version: 4, scene: { widthCells: 20 } });
    expect(resyncs).toBe(0);
  });

  it('an event that skips a version asks for a resync once until the next snapshot', () => {
    apply({ kind: 'board', state: vharnBoard() }, sceneEvent(6), sceneEvent(7));
    expect(resyncs).toBe(1);
    expect(store.getState().board?.version).toBe(4);
    apply({ kind: 'board', state: vharnBoard({ version: 7 }) }, sceneEvent(9));
    expect(resyncs).toBe(2);
  });

  it('an area event that skips a version is held and asks for one resync, a duplicate is ignored', () => {
    const created = (version: number) => {
      const event: BoardEvent = {
        type: 'effectAreasCreated',
        payload: { ...VHARN_GRID, version, at: AT_OF_AREAS, effectAreas: [biaCone()] },
      };
      return { kind: 'boardEvent', event } as const;
    };
    apply({ kind: 'board', state: vharnBoard() }, created(6));
    expect(resyncs).toBe(1);
    expect(store.getState().board?.effectAreas).toEqual([]);
    apply(created(5), created(5));
    expect(store.getState().board).toMatchObject({ version: 5, effectAreas: [biaCone()] });
  });

  it('a light event that skips a version is held and asks for one resync', () => {
    const created = (version: number) => {
      const event: BoardEvent = {
        type: 'lightsCreated',
        payload: { ...VHARN_GRID, version, at: AT_OF_AREAS, lights: [corridorTorch()] },
      };
      return { kind: 'boardEvent', event } as const;
    };
    apply({ kind: 'board', state: vharnBoard() }, created(6));
    expect(resyncs).toBe(1);
    expect(store.getState().board?.lights).toEqual([]);
    apply(created(5));
    expect(store.getState().board).toMatchObject({ version: 5, lights: [corridorTorch()] });
  });

  it('a light color event that skips a version is held and asks for one resync', () => {
    const colored = (version: number) => {
      const event: BoardEvent = {
        type: 'lightColorsChanged',
        payload: {
          ...VHARN_GRID,
          version,
          at: AT_OF_AREAS,
          changes: [{ lightId: CORRIDOR_TORCH_ID, color: 'fire' }],
        },
      };
      return { kind: 'boardEvent', event } as const;
    };
    apply({ kind: 'board', state: vharnBoard({ lights: [corridorTorch()] }) }, colored(6));
    expect(resyncs).toBe(1);
    expect(store.getState().board?.lights).toEqual([corridorTorch()]);
    apply(colored(5));
    expect(store.getState().board?.lights).toEqual([corridorTorch({ color: 'fire' })]);
  });

  it('events before the first snapshot wait and the ones above it apply after it', () => {
    apply(sceneEvent(4, 25), sceneEvent(5, 30), { kind: 'board', state: vharnBoard() });
    expect(store.getState().board).toMatchObject({ version: 5, scene: { widthCells: 30 } });
  });

  it('events held after a gap apply on top of the snapshot that answers the resync', () => {
    apply({ kind: 'board', state: vharnBoard() }, sceneEvent(6, 40));
    apply({ kind: 'board', state: vharnBoard({ version: 5 }) });
    expect(store.getState().board).toMatchObject({ version: 6, scene: { widthCells: 40 } });
  });

  it('an event of another table is ignored', () => {
    apply(
      { kind: 'board', state: vharnBoard() },
      boardEventOf(sceneUpdated({ campaignId: QUELM.id })),
    );
    expect(store.getState().board?.version).toBe(4);
  });

  describe('the group grid moving to another grid', () => {
    const onEstrada = (version: number) =>
      boardEventOf(
        sceneUpdated({
          sceneId: ESTRADA_SCENE.id,
          version,
          scene: { ...ESTRADA_SCENE, widthCells: 40 },
        }),
      );

    it('an event of another grid waits, untouched by the version of the board shown', () => {
      apply({ kind: 'board', state: vharnBoard() }, onEstrada(5));
      expect(store.getState().board).toMatchObject({ version: 4, scene: { id: VHARN_SCENE.id } });
      expect(resyncs).toBe(0);
    });

    it('the snapshot of that grid applies the events of it held above its version', () => {
      apply({ kind: 'board', state: vharnBoard() }, onEstrada(8), onEstrada(6));
      apply({ kind: 'board', state: estradaBoard() });
      expect(store.getState().board).toMatchObject({ version: 8, scene: { widthCells: 40 } });
    });

    it('a snapshot of the grid drops the held events of any other grid', () => {
      apply(sceneEvent(5, 25), onEstrada(8));
      apply({ kind: 'board', state: estradaBoard() });
      expect(store.getState().board).toMatchObject({ version: 8, scene: { id: ESTRADA_SCENE.id } });
      expect(store.getState().held).toEqual([]);
    });

    it('a drag preview over another grid is not drawn here', () => {
      apply({ kind: 'board', state: vharnBoard() });
      const drag = groupDraggedOver([{ tokenId: LYRA_ID, cell: { col: 2, row: 2 } }], {
        sceneId: ESTRADA_SCENE.id,
      });
      apply({ kind: 'tokensDragged', drag });
      expect(store.getState().dragged).toEqual({});
    });
  });

  it('a failed sync before any snapshot fails the board with the reason', () => {
    apply({ kind: 'boardFailed', failure: 'not_found' });
    expect(store.getState()).toMatchObject({ status: 'failed', failure: 'not_found' });
  });

  it('a failed resync keeps the board it already had', () => {
    apply({ kind: 'board', state: vharnBoard() }, { kind: 'boardFailed', failure: 'offline' });
    expect(store.getState()).toMatchObject({ status: 'ready', board: vharnBoard() });
  });

  it('retry asks for a sync and goes back to loading', () => {
    apply({ kind: 'boardFailed', failure: 'offline' });
    store.getState().retry();
    expect(store.getState()).toMatchObject({ status: 'loading', failure: null });
    expect(resyncs).toBe(1);
  });

  it('presence updates are none of its business', () => {
    apply({ kind: 'status', status: 'live' });
    expect(store.getState().status).toBe('loading');
  });

  describe('tokens', () => {
    function event(boardEvent: BoardEvent) {
      return { kind: 'boardEvent', event: boardEvent } as const;
    }

    it('token:created, moved, updated and deleted apply in version order', () => {
      apply({ kind: 'board', state: vharnBoard() });
      apply(event(tokenCreatedAt(5, lyra())));
      expect(store.getState().board?.tokens).toEqual([lyra()]);
      apply(event(tokenMovedAt(6, { col: 8, row: 6 })));
      expect(store.getState().board?.tokens[0]).toMatchObject({ col: 8, row: 6 });
      apply(event(tokenUpdatedAt(7, lyra({ name: 'Lyra, a Rubra', col: 8, row: 6 }))));
      expect(store.getState().board?.tokens[0]?.name).toBe('Lyra, a Rubra');
      apply(event(tokenDeletedAt(8)));
      expect(store.getState().board?.tokens).toEqual([]);
      expect(store.getState().board?.version).toBe(8);
    });

    it('a move that skips a version waits for the resync instead of applying', () => {
      apply({ kind: 'board', state: vharnBoard({ tokens: [lyra()] }) });
      apply(event(tokenMovedAt(6, { col: 8, row: 6 })));
      expect(store.getState().board?.tokens[0]).toMatchObject({ col: 3, row: 4 });
      expect(resyncs).toBe(1);
    });

    it('token:movedMany one version above moves every token of the group', () => {
      apply({ kind: 'board', state: vharnBoard({ tokens: [lyra(), kael()] }) });
      const moves = [
        { tokenId: LYRA_ID, col: 8, row: 6 },
        { tokenId: KAEL_ID, col: 9, row: 6 },
      ];
      apply(event(eventAt(5, { type: 'tokensMoved', payload: { moves } })));
      const cells = store.getState().board?.tokens.map(({ col, row }) => [col, row]);
      expect(cells).toEqual([
        [8, 6],
        [9, 6],
      ]);
      expect(store.getState().board?.version).toBe(5);
    });

    it('token:layerChanged puts every listed token on the layer and leaves the others', () => {
      apply({ kind: 'board', state: vharnBoard({ tokens: [lyra(), kael()] }) });
      const payload = { tokenIds: [KAEL_ID], layer: 'background' } as const;
      apply(
        event(
          eventAt(5, { type: 'tokenLayerChanged', payload: { ...payload, tokenIds: [KAEL_ID] } }),
        ),
      );
      expect(store.getState().board?.tokens.map(({ layer }) => layer)).toEqual([
        'tokens',
        'background',
      ]);
    });

    it('a token:movedMany that skips a version waits for the resync', () => {
      apply({ kind: 'board', state: vharnBoard({ tokens: [lyra()] }) });
      const moves = [{ tokenId: LYRA_ID, col: 8, row: 6 }];
      apply(event(eventAt(6, { type: 'tokensMoved', payload: { moves } })));
      expect(store.getState().board?.tokens[0]).toMatchObject({ col: 3, row: 4 });
      expect(resyncs).toBe(1);
    });

    it('counts the snapshots, so the room can drop its previews on each one', () => {
      apply({ kind: 'board', state: vharnBoard() }, { kind: 'board', state: vharnBoard() });
      expect(store.getState().snapshots).toBe(2);
    });
  });

  describe('drags of other people', () => {
    // Lyra dragged alone: a group of one.
    function dragged(cell: Readonly<{ col: number; row: number }> | null) {
      return {
        kind: 'tokensDragged',
        drag: groupDraggedOver([{ tokenId: LYRA_ID, cell }]),
      } as const;
    }

    beforeEach(() => apply({ kind: 'board', state: vharnBoard({ version: 5, tokens: [lyra()] }) }));

    it('a drag preview of Lyra keeps the cell over the confirmed one, with no version change', () => {
      apply(dragged({ col: 5, row: 4 }), dragged({ col: 6, row: 4 }));
      expect(store.getState().dragged).toEqual({ [LYRA_ID]: { col: 6, row: 4 } });
      expect(store.getState().board?.tokens[0]).toMatchObject({ col: 3, row: 4 });
      expect(store.getState().board?.version).toBe(5);
    });

    it('a drag that ends with null puts the token back on its confirmed cell', () => {
      apply(dragged({ col: 5, row: 4 }), dragged(null));
      expect(store.getState().dragged).toEqual({});
    });

    it('the confirmed token:moved ends the drag', () => {
      apply(dragged({ col: 5, row: 4 }), {
        kind: 'boardEvent',
        event: tokenMovedAt(6, { col: 8, row: 6 }),
      });
      expect(store.getState().dragged).toEqual({});
    });

    it('token:deleted ends the drag of the token that left', () => {
      apply(dragged({ col: 5, row: 4 }), { kind: 'boardEvent', event: tokenDeletedAt(6) });
      expect(store.getState().dragged).toEqual({});
    });

    it('a snapshot drops every drag: whoever was dragging may be gone', () => {
      apply(dragged({ col: 5, row: 4 }), { kind: 'board', state: vharnBoard() });
      expect(store.getState().dragged).toEqual({});
    });

    it('a token:draggedMany keeps the cell of each token, and null clears that one', () => {
      const first = groupDraggedOver([
        { tokenId: LYRA_ID, cell: { col: 5, row: 4 } },
        { tokenId: KAEL_ID, cell: { col: 6, row: 4 } },
      ]);
      const end = groupDraggedOver([{ tokenId: KAEL_ID, cell: null }]);
      apply({ kind: 'tokensDragged', drag: first }, { kind: 'tokensDragged', drag: end });
      expect(store.getState().dragged).toEqual({ [LYRA_ID]: { col: 5, row: 4 } });
      expect(store.getState().board?.version).toBe(5);
    });

    it('the confirmed token:movedMany ends the drag of every moved token', () => {
      const drags = [
        { tokenId: LYRA_ID, cell: { col: 5, row: 4 } },
        { tokenId: KAEL_ID, cell: { col: 6, row: 4 } },
      ];
      const moves = [{ tokenId: LYRA_ID, col: 5, row: 4 }];
      apply(
        { kind: 'tokensDragged', drag: groupDraggedOver(drags) },
        { kind: 'boardEvent', event: eventAt(6, { type: 'tokensMoved', payload: { moves } }) },
      );
      expect(store.getState().dragged).toEqual({ [KAEL_ID]: { col: 6, row: 4 } });
    });

    it('a drag of another table is ignored', () => {
      apply({
        kind: 'tokensDragged',
        drag: groupDraggedOver([{ tokenId: LYRA_ID, cell: { col: 1, row: 1 } }], {
          campaignId: QUELM.id,
        }),
      });
      expect(store.getState().dragged).toEqual({});
    });
  });

  describe('combat and conditions', () => {
    function on(boardEvent: BoardEvent) {
      return { kind: 'boardEvent', event: boardEvent } as const;
    }

    beforeEach(() => {
      apply({ kind: 'board', state: vharnBoard({ tokens: [lyra()] }) });
    });

    it('combat:started, updated and ended set and clear the combat', () => {
      apply(on(eventAt(5, { type: 'combatStarted', payload: { combat: vharnCombat() } })));
      expect(store.getState().board?.combat?.currentCombatantId).toBe(KAEL_COMBATANT);
      apply(
        on(eventAt(6, { type: 'combatUpdated', payload: { combat: vharnCombat({ round: 2 }) } })),
      );
      expect(store.getState().board?.combat?.round).toBe(2);
      apply(on(eventAt(7, { type: 'combatEnded', payload: {} })));
      expect(store.getState().board?.combat).toBeNull();
    });

    it('combat:turnChanged moves the turn and applies the conditions changed at the end of it', () => {
      apply(
        on(
          eventAt(5, {
            type: 'conditionApplied',
            payload: { tokenId: LYRA_ID, condition: activeCondition() },
          }),
        ),
      );
      const changed = vharnCombat({ currentCombatantId: LYRA_COMBATANT });
      apply(
        on(
          eventAt(6, {
            type: 'combatTurnChanged',
            payload: { combat: changed, conditionChanges: [{ tokenId: LYRA_ID, conditions: [] }] },
          }),
        ),
      );
      expect(store.getState().board?.combat?.currentCombatantId).toBe(LYRA_COMBATANT);
      expect(store.getState().board?.tokens[0]?.conditions).toEqual([]);
    });

    it('condition:appliedMany puts the condition on each listed token, leaving the others', () => {
      apply({ kind: 'board', state: vharnBoard({ tokens: [lyra(), kael()] }) });
      const caido = activeCondition({ remainingRounds: null });
      apply(
        on(
          eventAt(5, {
            type: 'conditionsApplied',
            payload: { applied: [{ tokenId: KAEL_ID, condition: caido }] },
          }),
        ),
      );
      const tokens = store.getState().board?.tokens ?? [];
      expect(tokens.find(({ id }) => id === KAEL_ID)?.conditions).toEqual([caido]);
      expect(tokens.find(({ id }) => id === LYRA_ID)?.conditions).toEqual([]);
    });

    it('condition:applied twice replaces the duration, and condition:removed takes it off', () => {
      apply(
        on(
          eventAt(5, {
            type: 'conditionApplied',
            payload: { tokenId: LYRA_ID, condition: activeCondition() },
          }),
        ),
      );
      apply(
        on(
          eventAt(6, {
            type: 'conditionApplied',
            payload: { tokenId: LYRA_ID, condition: activeCondition({ remainingRounds: 5 }) },
          }),
        ),
      );
      expect(store.getState().board?.tokens[0]?.conditions).toEqual([
        activeCondition({ remainingRounds: 5 }),
      ]);
      apply(
        on(
          eventAt(7, {
            type: 'conditionRemoved',
            payload: { tokenId: LYRA_ID, activeConditionId: activeCondition().id },
          }),
        ),
      );
      expect(store.getState().board?.tokens[0]?.conditions).toEqual([]);
    });

    it('condition:defined adds to the list of the table', () => {
      const definition = {
        id: activeCondition().conditionId,
        name: 'Sangrando',
        tone: 'harm',
        icon: 'droplet',
        color: null,
        look: null,
        description: '',
        maxStacks: null,
        imageAssetId: null,
      } as const;
      apply(on(eventAt(5, { type: 'conditionDefined', payload: { definition } })));
      expect(store.getState().board?.conditionDefinitions).toEqual([definition]);
    });

    it('combat:ended keeps the conditions on the tokens', () => {
      apply(
        on(
          eventAt(5, {
            type: 'conditionApplied',
            payload: { tokenId: LYRA_ID, condition: activeCondition() },
          }),
        ),
      );
      apply(on(eventAt(6, { type: 'combatEnded', payload: {} })));
      expect(store.getState().board?.tokens[0]?.conditions).toHaveLength(1);
    });

    it('token:deleted brings the combat as it is after the token left', () => {
      apply(on(eventAt(5, { type: 'combatStarted', payload: { combat: vharnCombat() } })));
      const after = vharnCombat({ currentCombatantId: LYRA_COMBATANT });
      apply(
        on(eventAt(6, { type: 'tokenDeleted', payload: { tokenId: 'kael-token', combat: after } })),
      );
      expect(store.getState().board?.combat?.currentCombatantId).toBe(LYRA_COMBATANT);
    });
  });

  describe('drawings', () => {
    it('a drawing event one version above applies; one that skips a version asks for a resync', () => {
      apply({ kind: 'board', state: vharnBoard() });
      const created = eventAt(5, { type: 'drawingsCreated', payload: { drawings: [square()] } });
      const skipped = eventAt(7, { type: 'drawingsDeleted', payload: { drawingIds: [SQUARE_ID] } });

      apply({ kind: 'boardEvent', event: created }, { kind: 'boardEvent', event: skipped });

      expect(store.getState().board?.drawings).toEqual([square()]);
      expect(resyncs).toBe(1);
    });
  });

  describe('hidden tokens and veiled lights', () => {
    const advanced = (version: number) =>
      ({
        kind: 'boardEvent',
        event: eventAt(version, { type: 'boardAdvanced', payload: {} }),
      }) as const;
    const veiled = (...lights: ReturnType<typeof veiledTorch>[]) =>
      ({ kind: 'veiledLights', event: veiledLightsChanged(lights) }) as const;

    beforeEach(() => apply({ kind: 'board', state: vharnBoard({ tokens: [lyra(), kael()] }) }));

    it('board:advanced one version above only moves the version: the tokens stay the same array', () => {
      const tokens = store.getState().board?.tokens;
      apply(advanced(5));
      expect(store.getState().board?.version).toBe(5);
      expect(store.getState().board?.tokens).toBe(tokens);
    });

    it('a board:advanced that skips a version is held and asks for one resync', () => {
      apply(advanced(6), advanced(7));
      expect(resyncs).toBe(1);
      expect(store.getState().board?.version).toBe(4);
    });

    it('token:hiddenChanged hides only the listed tokens', () => {
      const hidden = eventAt(5, {
        type: 'tokensHiddenChanged',
        payload: { tokenIds: [KAEL_ID], hidden: true },
      });
      apply({ kind: 'boardEvent', event: hidden });
      const tokens = store.getState().board?.tokens;
      expect(tokens?.map(({ id, hidden }) => [id, hidden])).toEqual([
        [LYRA_ID, false],
        [KAEL_ID, true],
      ]);
    });

    it('token:veiledLightsChanged replaces the veiled lights with no version change', () => {
      apply(veiled(veiledTorch()), veiled(veiledTorch({ x: 9 })));
      expect(store.getState().board?.veiledLights).toEqual([veiledTorch({ x: 9 })]);
      expect(store.getState().board?.version).toBe(4);
      expect(resyncs).toBe(0);
    });

    it('a snapshot replaces the veiled lights too', () => {
      apply(veiled(veiledTorch()), { kind: 'board', state: vharnBoard() });
      expect(store.getState().board?.veiledLights).toEqual([]);
    });

    it('an empty list over no veiled light keeps the very same board (nothing to redo)', () => {
      const board = store.getState().board;
      apply(veiled());
      expect(store.getState().board).toBe(board);
    });

    it('the veiled lights of another grid or another table are not this board', () => {
      const elsewhere = veiledLightsChanged([veiledTorch()], { sceneId: ESTRADA_SCENE.id });
      const otherTable = veiledLightsChanged([veiledTorch()], { campaignId: QUELM.id });
      apply(
        { kind: 'veiledLights', event: elsewhere },
        { kind: 'veiledLights', event: otherTable },
      );
      expect(store.getState().board?.veiledLights).toEqual([]);
    });
  });
});
