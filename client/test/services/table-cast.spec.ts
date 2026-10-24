import { beforeEach, describe, expect, it } from 'vitest';
import {
  RealtimeTableSessionApi,
  type CastHandle,
  type GridUpdate,
  type TableSessionHandle,
  type TableSessionUpdate,
} from '@/services/table-session-api';
import { VHARN } from '../support/campaigns-api-fake';
import { VHARN_CAST, VHARN_CAST_ID, castBoard } from '../support/cast-fixtures';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import { TORRE_SCENE, torreBoard } from '../support/scene-tab-fixtures';
import { LYRA_ID, vharnBoard, vharnState } from '../support/table-session-fixtures';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const SYNC_CAST = { actionId: ACTION_ID, campaignId: VHARN.id, sceneId: VHARN_CAST_ID };

describe('the cast of a table visit', () => {
  let transport: RealtimeTransportFake;
  let tableUpdates: TableSessionUpdate[];
  let castUpdates: GridUpdate[];
  let handle: TableSessionHandle;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    tableUpdates = [];
    castUpdates = [];
    handle = new RealtimeTableSessionApi(transport, () => ACTION_ID).open(VHARN.id, (update) =>
      tableUpdates.push(update),
    );
  });

  function followCast(): CastHandle {
    return handle.followCast(VHARN_CAST_ID, (update) => castUpdates.push(update));
  }

  async function joined(): Promise<void> {
    transport.lifecycle({ kind: 'connected' });
    await transport.answerAck({ ok: true, state: vharnState() });
    await transport.answerAck({ ok: true, state: vharnBoard() }, 'board:sync');
  }

  function eventsSent(): string[] {
    return transport.sent.map(({ event }) => event);
  }

  const anchorUpdated = {
    ...VHARN_CAST,
    version: 4,
    at: '2026-10-23T12:00:00.000Z',
    token: castBoard().tokens[0],
  };

  it('after the join and the group sync, syncs the cast with board:sync (never scene:watch) and hands it the snapshot', async () => {
    followCast();
    await joined();
    expect(eventsSent()).toEqual(['session:join', 'board:sync', 'board:sync']);
    expect(transport.sent.at(-1)).toEqual({ event: 'board:sync', payload: SYNC_CAST });
    await transport.answerAck({ ok: true, state: castBoard() }, 'board:sync');
    expect(castUpdates).toEqual([{ kind: 'board', state: castBoard() }]);
    expect(tableUpdates.filter(({ kind }) => kind === 'board')).toHaveLength(1);
  });

  it('an event of the cast reaches only the cast, even before the group grid is known', async () => {
    followCast();
    transport.lifecycle({ kind: 'connected' });
    await transport.answerAck({ ok: true, state: vharnState() });
    transport.serverEmits('token:updated', anchorUpdated);
    expect(castUpdates).toEqual([
      { kind: 'boardEvent', event: { type: 'tokenUpdated', payload: anchorUpdated } },
    ]);
    expect(tableUpdates.map(({ kind }) => kind)).not.toContain('boardEvent');
  });

  it('a malformed event of the cast syncs the cast again, not the group grid', async () => {
    followCast();
    await joined();
    await transport.answerAck({ ok: true, state: castBoard() }, 'board:sync');
    transport.serverEmits('token:updated', { ...anchorUpdated, token: { id: LYRA_ID } });
    expect(transport.sent.at(-1)).toEqual({ event: 'board:sync', payload: SYNC_CAST });
  });

  it('resync asks for the cast snapshot again', async () => {
    const cast = followCast();
    await joined();
    await transport.answerAck({ ok: true, state: castBoard() }, 'board:sync');
    cast.resync();
    expect(transport.sent.at(-1)).toEqual({ event: 'board:sync', payload: SYNC_CAST });
  });

  it('a reconnection syncs the cast again after the group grid, before the extra tabs', async () => {
    followCast();
    handle.watch(TORRE_SCENE.id, () => undefined);
    await joined();
    await transport.answerAck({ ok: true, state: castBoard() }, 'board:sync');
    await transport.answerAck({ ok: true, state: torreBoard() }, 'scene:watch');
    transport.lifecycle({ kind: 'disconnected', willRetry: true });
    transport.sent.length = 0;
    await joined();
    expect(eventsSent()).toEqual(['session:join', 'board:sync', 'board:sync', 'scene:watch']);
  });
});
