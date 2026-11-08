import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { QUELM, VHARN } from '../support/campaigns-api-fake';
import { patrolsChangedAt } from '../support/patrol-fixtures';
import { kael, KAEL_ID, vharnBoard } from '../support/table-session-fixtures';

const SNAPSHOT_AT = '2026-11-08T12:00:00.000Z';
const EVENT_AT = '2026-11-08T12:00:05.000Z';
const LATE_AT = '2026-11-08T12:00:09.000Z';

describe('board store, the server clock', () => {
  let wallNow: number;
  let store: StoreApi<BoardStore>;

  beforeEach(() => {
    wallNow = 0;
    store = createBoardStore(
      VHARN.id,
      () => undefined,
      undefined,
      () => wallNow,
    );
  });

  function receiveAt(at: string, lagMs: number, update: Parameters<BoardStore['apply']>[0]): void {
    wallNow = Date.parse(at) + lagMs;
    store.getState().apply(update);
  }

  function patrolEvent(
    version: number,
    at: string,
    campaignId = VHARN.id,
  ): Parameters<BoardStore['apply']>[0] {
    const change = { tokenId: KAEL_ID, patrol: null, col: 5, row: 4, facing: 0 };
    const payload = { ...patrolsChangedAt(version, [change], at), campaignId };
    return { kind: 'boardEvent', event: { type: 'tokenPatrolsChanged', payload } };
  }

  it('starts with no offset before anything of the server arrived', () => {
    expect(store.getState().serverOffsetMs).toBeNull();
  });

  it('a snapshot received 120 ms after its stamp sets the offset to 120', () => {
    receiveAt(SNAPSHOT_AT, 120, { kind: 'board', state: vharnBoard({ at: SNAPSHOT_AT }) });

    expect(store.getState().serverOffsetMs).toBe(120);
  });

  it('a later event delivered faster (80 ms) lowers the offset to 80', () => {
    receiveAt(SNAPSHOT_AT, 120, { kind: 'board', state: vharnBoard({ at: SNAPSHOT_AT }) });
    receiveAt(EVENT_AT, 80, patrolEvent(5, EVENT_AT));

    expect(store.getState().serverOffsetMs).toBe(80);
  });

  it('an event delivered late (200 ms) does not raise it back', () => {
    receiveAt(SNAPSHOT_AT, 120, { kind: 'board', state: vharnBoard({ at: SNAPSHOT_AT }) });
    receiveAt(EVENT_AT, 80, patrolEvent(5, EVENT_AT));
    receiveAt(LATE_AT, 200, patrolEvent(6, LATE_AT));

    expect(store.getState().serverOffsetMs).toBe(80);
  });

  it('an event of another table measures nothing', () => {
    receiveAt(SNAPSHOT_AT, 120, { kind: 'board', state: vharnBoard({ at: SNAPSHOT_AT }) });
    receiveAt(EVENT_AT, 10, patrolEvent(5, EVENT_AT, QUELM.id));

    expect(store.getState().serverOffsetMs).toBe(120);
  });

  it('the patrol event itself lands on the board like any other one version above', () => {
    const tokens = [kael()];
    receiveAt(SNAPSHOT_AT, 120, { kind: 'board', state: vharnBoard({ at: SNAPSHOT_AT, tokens }) });
    receiveAt(EVENT_AT, 80, patrolEvent(5, EVENT_AT));

    expect(store.getState().board?.version).toBe(5);
  });
});
