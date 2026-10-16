import { beforeEach, describe, expect, it } from 'vitest';
import type { BoardEvent } from '@/services/board-events';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import type { StoreApi } from 'zustand/vanilla';
import { QUELM, VHARN } from '../support/campaigns-api-fake';
import {
  VHARN_SCENE,
  activeCondition,
  eventAt,
  KAEL_COMBATANT,
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
} from '../support/table-session-fixtures';

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

    it('counts the snapshots, so the room can drop its previews on each one', () => {
      apply({ kind: 'board', state: vharnBoard() }, { kind: 'board', state: vharnBoard() });
      expect(store.getState().snapshots).toBe(2);
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
});
