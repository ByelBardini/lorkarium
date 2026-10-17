import { beforeEach, describe, expect, it } from 'vitest';
import {
  RealtimeTableSessionApi,
  type TableSessionHandle,
  type TableSessionUpdate,
} from '@/services/table-session-api';
import { QUELM, VHARN } from '../support/campaigns-api-fake';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import {
  LYRA_ID,
  groupDraggedOver,
  sceneUpdated,
  vharnBoard,
  vharnState,
} from '../support/table-session-fixtures';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const COMMAND = { actionId: ACTION_ID, campaignId: VHARN.id };

describe('board sync of a table visit', () => {
  let transport: RealtimeTransportFake;
  let updates: TableSessionUpdate[];
  let handle: TableSessionHandle;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    updates = [];
    handle = new RealtimeTableSessionApi(transport, () => ACTION_ID).open(VHARN.id, (update) =>
      updates.push(update),
    );
  });

  async function joined(): Promise<void> {
    transport.lifecycle({ kind: 'connected' });
    await transport.answerAck({ ok: true, state: vharnState() });
  }

  function boardUpdates(): TableSessionUpdate[] {
    return updates.filter(({ kind }) => kind.startsWith('board'));
  }

  function syncsSent(): number {
    return transport.sent.filter(({ event }) => event === 'board:sync').length;
  }

  it('after the join ack, board:sync goes out and its snapshot reaches the listener', async () => {
    await joined();
    expect(transport.sent.at(-1)).toEqual({ event: 'board:sync', payload: COMMAND });
    await transport.answerAck({ ok: true, state: vharnBoard() }, 'board:sync');
    expect(boardUpdates()).toEqual([{ kind: 'board', state: vharnBoard() }]);
  });

  it('no board:sync goes out before the join is confirmed', () => {
    transport.lifecycle({ kind: 'connected' });
    expect(syncsSent()).toBe(0);
  });

  it.each([
    ['CAMPAIGN_NOT_FOUND', 'not_found'],
    ['UNAUTHENTICATED', 'unauthenticated'],
    ['INTERNAL_ERROR', 'unexpected'],
  ])('a sync refused with %s fails the board as %s', async (code, failure) => {
    await joined();
    await transport.answerAck({ ok: false, error: { code, message: 'x' } }, 'board:sync');
    expect(boardUpdates()).toEqual([{ kind: 'boardFailed', failure }]);
  });

  it('a sync ack that never arrives fails the board as offline', async () => {
    await joined();
    await transport.timeOutAck('board:sync');
    expect(boardUpdates()).toEqual([{ kind: 'boardFailed', failure: 'offline' }]);
  });

  it('a sync ack outside the DTO fails the board as unexpected', async () => {
    await joined();
    await transport.answerAck({ ok: true, state: { ...vharnBoard(), scene: null } }, 'board:sync');
    expect(boardUpdates()).toEqual([{ kind: 'boardFailed', failure: 'unexpected' }]);
  });

  it('a valid scene:updated of this table arrives as a board event', async () => {
    await joined();
    transport.serverEmits('scene:updated', sceneUpdated());
    expect(boardUpdates()).toEqual([
      { kind: 'boardEvent', event: { type: 'sceneUpdated', payload: sceneUpdated() } },
    ]);
  });

  it('a scene:updated of another table is ignored and asks for nothing', async () => {
    await joined();
    transport.serverEmits('scene:updated', sceneUpdated({ campaignId: QUELM.id }));
    expect(boardUpdates()).toEqual([]);
    expect(syncsSent()).toBe(1);
  });

  it('a scene:updated of this table outside the DTO is dropped and the board syncs again', async () => {
    await joined();
    transport.serverEmits('scene:updated', { ...sceneUpdated(), scene: { widthCells: 0 } });
    expect(boardUpdates()).toEqual([]);
    expect(syncsSent()).toBe(2);
  });

  it('a token:draggedMany of this table arrives as a group drag preview', async () => {
    await joined();
    const drag = groupDraggedOver([{ tokenId: LYRA_ID, cell: { col: 5, row: 4 } }]);
    transport.serverEmits('token:draggedMany', drag);
    expect(updates.at(-1)).toEqual({ kind: 'tokensDragged', drag });
  });

  it('a token:draggedMany of another table is ignored', async () => {
    await joined();
    const drag = groupDraggedOver([{ tokenId: LYRA_ID, cell: null }], { campaignId: QUELM.id });
    transport.serverEmits('token:draggedMany', drag);
    expect(updates.map(({ kind }) => kind)).not.toContain('tokensDragged');
  });

  it('a token:draggedMany outside the DTO is dropped without a resync: it confirmed nothing', async () => {
    await joined();
    transport.serverEmits('token:draggedMany', { ...groupDraggedOver([]), drags: 'all' });
    expect(updates.map(({ kind }) => kind)).not.toContain('tokensDragged');
    expect(syncsSent()).toBe(1);
  });

  it('a token:movedMany of this table outside the DTO is dropped and the board syncs again', async () => {
    await joined();
    const at = '2026-10-16T12:00:00.000Z';
    transport.serverEmits('token:movedMany', { campaignId: VHARN.id, version: 6, at, moves: 1 });
    expect(boardUpdates()).toEqual([]);
    expect(syncsSent()).toBe(2);
  });

  it('resync() sends a new board:sync', async () => {
    await joined();
    handle.resync();
    expect(syncsSent()).toBe(2);
  });

  it('coming back after a drop rejoins and then syncs the board again', async () => {
    await joined();
    await transport.answerAck({ ok: true, state: vharnBoard() }, 'board:sync');
    transport.lifecycle({ kind: 'disconnected', willRetry: true });
    await joined();
    expect(transport.sent.map(({ event }) => event)).toEqual([
      'session:join',
      'board:sync',
      'session:join',
      'board:sync',
    ]);
  });

  it('a sync ack landing after close is not delivered', async () => {
    await joined();
    handle.close();
    await transport.answerAck({ ok: true, state: vharnBoard() }, 'board:sync');
    expect(boardUpdates()).toEqual([]);
  });
});
