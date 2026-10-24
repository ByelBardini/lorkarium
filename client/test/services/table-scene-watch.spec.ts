import { beforeEach, describe, expect, it } from 'vitest';
import {
  RealtimeTableSessionApi,
  type GridUpdate,
  type GridWatchHandle,
  type TableSessionHandle,
  type TableSessionUpdate,
} from '@/services/table-session-api';
import { QUELM, VHARN } from '../support/campaigns-api-fake';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import {
  ESTRADA_SCENE,
  TORRE_SCENE,
  estradaBoard,
  libraryChanged,
  sceneActivated,
  sceneClosed,
  torreBoard,
} from '../support/scene-tab-fixtures';
import {
  LYRA_ID,
  VHARN_SCENE,
  groupDraggedOver,
  sceneUpdated,
  vharnBoard,
  vharnState,
} from '../support/table-session-fixtures';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const WATCH_TORRE = { actionId: ACTION_ID, campaignId: VHARN.id, sceneId: TORRE_SCENE.id };

describe('extra grid tabs of a table visit', () => {
  let transport: RealtimeTransportFake;
  let tableUpdates: TableSessionUpdate[];
  let torreUpdates: GridUpdate[];
  let handle: TableSessionHandle;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    tableUpdates = [];
    torreUpdates = [];
    handle = new RealtimeTableSessionApi(transport, () => ACTION_ID).open(VHARN.id, (update) =>
      tableUpdates.push(update),
    );
  });

  async function joinedWithGroupBoard(): Promise<void> {
    transport.lifecycle({ kind: 'connected' });
    await transport.answerAck({ ok: true, state: vharnState() });
    await transport.answerAck({ ok: true, state: vharnBoard() }, 'board:sync');
  }

  function watchTorre(): GridWatchHandle {
    return handle.watch(TORRE_SCENE.id, (update) => torreUpdates.push(update));
  }

  function eventsSent(): string[] {
    return transport.sent.map(({ event }) => event);
  }

  function boardKinds(updates: readonly TableSessionUpdate[]): string[] {
    return updates.map(({ kind }) => kind).filter((kind) => kind.startsWith('board'));
  }

  it('watching a grid sends scene:watch and hands its snapshot to the tab, not to the table', async () => {
    await joinedWithGroupBoard();
    watchTorre();
    expect(transport.sent.at(-1)).toEqual({ event: 'scene:watch', payload: WATCH_TORRE });
    await transport.answerAck({ ok: true, state: torreBoard() }, 'scene:watch');
    expect(torreUpdates).toEqual([{ kind: 'board', state: torreBoard() }]);
    expect(boardKinds(tableUpdates)).toEqual(['board']);
  });

  it('a watch asked before the join goes out only after the join and the group sync', async () => {
    watchTorre();
    transport.lifecycle({ kind: 'connected' });
    expect(eventsSent()).toEqual(['session:join']);
    await transport.answerAck({ ok: true, state: vharnState() });
    await transport.answerAck({ ok: true, state: vharnBoard() }, 'board:sync');
    expect(eventsSent()).toEqual(['session:join', 'board:sync', 'scene:watch']);
  });

  it('an event of the watched grid reaches only its tab; one of the group grid only the table', async () => {
    await joinedWithGroupBoard();
    watchTorre();
    const torreEvent = sceneUpdated({ sceneId: TORRE_SCENE.id, scene: TORRE_SCENE });
    transport.serverEmits('scene:updated', torreEvent);
    transport.serverEmits('scene:updated', sceneUpdated());
    expect(torreUpdates).toEqual([
      { kind: 'boardEvent', event: { type: 'sceneUpdated', payload: torreEvent } },
    ]);
    expect(tableUpdates.at(-1)).toEqual({
      kind: 'boardEvent',
      event: { type: 'sceneUpdated', payload: sceneUpdated() },
    });
    expect(boardKinds(tableUpdates)).toEqual(['board', 'boardEvent']);
  });

  it('a drag preview naming the watched grid reaches its tab; one naming no grid is the group one', async () => {
    await joinedWithGroupBoard();
    watchTorre();
    const overTorre = groupDraggedOver([{ tokenId: LYRA_ID, cell: null }], {
      sceneId: TORRE_SCENE.id,
    });
    transport.serverEmits('token:draggedMany', overTorre);
    transport.serverEmits('token:draggedMany', groupDraggedOver([]));
    expect(torreUpdates).toEqual([{ kind: 'tokensDragged', drag: overTorre }]);
    expect(tableUpdates.at(-1)).toEqual({ kind: 'tokensDragged', drag: groupDraggedOver([]) });
  });

  it('a watch refused with SCENE_NOT_FOUND fails the tab as not_found', async () => {
    await joinedWithGroupBoard();
    watchTorre();
    const refusal = { ok: false, error: { code: 'SCENE_NOT_FOUND', message: 'x' } };
    await transport.answerAck(refusal, 'scene:watch');
    expect(torreUpdates).toEqual([{ kind: 'boardFailed', failure: 'not_found' }]);
  });

  it('closing a tab sends scene:unwatch and nothing of that grid reaches it after', async () => {
    await joinedWithGroupBoard();
    const tab = watchTorre();
    tab.close();
    expect(transport.sent.at(-1)).toEqual({ event: 'scene:unwatch', payload: WATCH_TORRE });
    transport.serverEmits('scene:updated', sceneUpdated({ sceneId: TORRE_SCENE.id }));
    await transport.answerAck({ ok: true, state: torreBoard() }, 'scene:watch');
    expect(torreUpdates).toEqual([]);
  });

  it('a reconnection joins again, syncs the group grid and watches each open tab again', async () => {
    await joinedWithGroupBoard();
    watchTorre();
    await transport.answerAck({ ok: true, state: torreBoard() }, 'scene:watch');
    transport.lifecycle({ kind: 'disconnected', willRetry: true });
    await joinedWithGroupBoard();
    expect(eventsSent()).toEqual([
      'session:join',
      'board:sync',
      'scene:watch',
      'session:join',
      'board:sync',
      'scene:watch',
    ]);
  });

  it('resync() of a tab watches its grid again for a fresh snapshot', async () => {
    await joinedWithGroupBoard();
    const tab = watchTorre();
    await transport.answerAck({ ok: true, state: torreBoard() }, 'scene:watch');
    tab.resync();
    await transport.answerAck({ ok: true, state: torreBoard({ version: 5 }) }, 'scene:watch');
    expect(torreUpdates.at(-1)).toEqual({ kind: 'board', state: torreBoard({ version: 5 }) });
  });

  it('an event of the watched grid outside the DTO resyncs that tab, not the group grid', async () => {
    await joinedWithGroupBoard();
    watchTorre();
    transport.serverEmits('scene:updated', {
      ...sceneUpdated({ sceneId: TORRE_SCENE.id }),
      scene: { widthCells: 0 },
    });
    expect(eventsSent().filter((event) => event === 'scene:watch')).toHaveLength(2);
    expect(eventsSent().filter((event) => event === 'board:sync')).toHaveLength(1);
  });

  it('scene:activated reaches the table, syncs the group grid again and routes its events there', async () => {
    await joinedWithGroupBoard();
    transport.serverEmits('scene:activated', sceneActivated());
    expect(tableUpdates.at(-1)).toEqual({ kind: 'sceneActivated', event: sceneActivated() });
    expect(transport.sent.at(-1)?.event).toBe('board:sync');
    await transport.answerAck({ ok: true, state: estradaBoard() }, 'board:sync');
    const onEstrada = sceneUpdated({ sceneId: ESTRADA_SCENE.id, scene: ESTRADA_SCENE, version: 8 });
    transport.serverEmits('scene:updated', onEstrada);
    transport.serverEmits('scene:updated', sceneUpdated({ sceneId: VHARN_SCENE.id }));
    expect(boardKinds(tableUpdates)).toEqual(['board', 'board', 'boardEvent']);
    expect(tableUpdates.at(-1)).toMatchObject({ event: { payload: onEstrada } });
  });

  it('scene:closed reaches the table and the server-forgotten tab is not watched again', async () => {
    await joinedWithGroupBoard();
    const tab = watchTorre();
    await transport.answerAck({ ok: true, state: torreBoard() }, 'scene:watch');
    transport.serverEmits('scene:closed', sceneClosed('private'));
    expect(tableUpdates.at(-1)).toEqual({ kind: 'sceneClosed', event: sceneClosed('private') });
    tab.close();
    transport.lifecycle({ kind: 'disconnected', willRetry: true });
    await joinedWithGroupBoard();
    expect(eventsSent().filter((event) => event.startsWith('scene:'))).toEqual(['scene:watch']);
  });

  it('library:changed of this table reaches it; one of another table or outside the DTO does not', async () => {
    await joinedWithGroupBoard();
    transport.serverEmits('library:changed', libraryChanged({ campaignId: QUELM.id }));
    transport.serverEmits('library:changed', { campaignId: VHARN.id });
    transport.serverEmits('library:changed', libraryChanged());
    expect(tableUpdates.filter(({ kind }) => kind === 'libraryChanged')).toEqual([
      { kind: 'libraryChanged', event: libraryChanged() },
    ]);
  });
});
