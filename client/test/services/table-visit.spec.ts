import { imagePresentation } from '../support/image-presentation-fixtures';
import type { DocumentTabChangedDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  RealtimeTableSessionApi,
  type GridUpdate,
  type TableSessionHandle,
  type TableSessionUpdate,
} from '@/services/table-session-api';
import { QUELM, VHARN } from '../support/campaigns-api-fake';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import { TORRE_SCENE, torreBoard } from '../support/scene-tab-fixtures';
import { veiledTorch } from '../support/light-fixtures';
import { documentTabChanged } from '../support/documents-fixtures';
import {
  boardPinged,
  vharnBoard,
  vharnState,
  veiledLightsChanged,
} from '../support/table-session-fixtures';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';

describe('pings of a table visit', () => {
  let transport: RealtimeTransportFake;
  let tableUpdates: TableSessionUpdate[];
  let torreUpdates: GridUpdate[];
  let handle: TableSessionHandle;

  beforeEach(async () => {
    transport = new RealtimeTransportFake();
    tableUpdates = [];
    torreUpdates = [];
    handle = new RealtimeTableSessionApi(transport, () => ACTION_ID).open(VHARN.id, (update) =>
      tableUpdates.push(update),
    );
    transport.lifecycle({ kind: 'connected' });
    await transport.answerAck({ ok: true, state: vharnState() });
    await transport.answerAck({ ok: true, state: vharnBoard() }, 'board:sync');
  });

  function pingsOf(updates: readonly TableSessionUpdate[]): TableSessionUpdate[] {
    return updates.filter(({ kind }) => kind === 'pinged');
  }

  async function watchTorre(): Promise<void> {
    handle.watch(TORRE_SCENE.id, (update) => torreUpdates.push(update));
    await transport.answerAck({ ok: true, state: torreBoard() }, 'scene:watch');
  }

  it('presentation events reach the campaign before join and discard foreign or malformed payloads', () => {
    const earlyTransport = new RealtimeTransportFake();
    const updates: TableSessionUpdate[] = [];
    const early = new RealtimeTableSessionApi(earlyTransport, () => ACTION_ID).open(
      VHARN.id,
      (update) => updates.push(update),
    );
    const event = { ...imagePresentation(), eventId: ACTION_ID };
    earlyTransport.serverEmits('library:imagePresentationChanged', event);
    earlyTransport.serverEmits('library:imagePresentationChanged', {
      ...event,
      campaignId: QUELM.id,
    });
    earlyTransport.serverEmits('library:imagePresentationChanged', { ...event, version: -1 });
    expect(updates.filter((update) => update.kind === 'imagePresentationChanged')).toEqual([
      { kind: 'imagePresentationChanged', event },
    ]);
    early.close();
  });

  it('a valid board:pinged of the group grid reaches the table as pinged', () => {
    transport.serverEmits('board:pinged', boardPinged());

    expect(pingsOf(tableUpdates)).toEqual([{ kind: 'pinged', event: boardPinged() }]);
  });

  it('a ping of a grid open in an extra tab reaches only that tab', async () => {
    await watchTorre();
    const onTorre = boardPinged({ sceneId: TORRE_SCENE.id });

    transport.serverEmits('board:pinged', onTorre);

    expect(pingsOf(torreUpdates)).toEqual([{ kind: 'pinged', event: onTorre }]);
    expect(pingsOf(tableUpdates)).toEqual([]);
  });

  it('a ping without userId is dropped, with no resync', () => {
    const noUser = { ...boardPinged(), userId: undefined };

    transport.serverEmits('board:pinged', noUser);

    expect(pingsOf(tableUpdates)).toEqual([]);
    expect(transport.pendingAcksOf('board:sync')).toBe(0);
  });

  it('a ping of another table is not this one', () => {
    transport.serverEmits('board:pinged', boardPinged({ campaignId: QUELM.id }));

    expect(pingsOf(tableUpdates)).toEqual([]);
  });

  it('after close nothing more arrives', () => {
    handle.close();

    transport.serverEmits('board:pinged', boardPinged());

    expect(pingsOf(tableUpdates)).toEqual([]);
  });
});

describe('veiled lights of a table visit', () => {
  let transport: RealtimeTransportFake;
  let tableUpdates: TableSessionUpdate[];
  let torreUpdates: GridUpdate[];
  let handle: TableSessionHandle;

  beforeEach(async () => {
    transport = new RealtimeTransportFake();
    tableUpdates = [];
    torreUpdates = [];
    handle = new RealtimeTableSessionApi(transport, () => ACTION_ID).open(VHARN.id, (update) =>
      tableUpdates.push(update),
    );
    transport.lifecycle({ kind: 'connected' });
    await transport.answerAck({ ok: true, state: vharnState() });
    await transport.answerAck({ ok: true, state: vharnBoard() }, 'board:sync');
  });

  function veiledOf(updates: readonly (TableSessionUpdate | GridUpdate)[]) {
    return updates.filter(({ kind }) => kind === 'veiledLights');
  }

  it('a valid token:veiledLightsChanged of the group grid reaches the table', () => {
    const event = veiledLightsChanged([veiledTorch()]);

    transport.serverEmits('token:veiledLightsChanged', event);

    expect(veiledOf(tableUpdates)).toEqual([{ kind: 'veiledLights', event }]);
  });

  it('the veiled lights of a grid open in an extra tab reach only that tab', async () => {
    handle.watch(TORRE_SCENE.id, (update) => torreUpdates.push(update));
    await transport.answerAck({ ok: true, state: torreBoard() }, 'scene:watch');
    const event = veiledLightsChanged([veiledTorch()], { sceneId: TORRE_SCENE.id });

    transport.serverEmits('token:veiledLightsChanged', event);

    expect(veiledOf(torreUpdates)).toEqual([{ kind: 'veiledLights', event }]);
    expect(veiledOf(tableUpdates)).toEqual([]);
  });

  it('a veiled light with bright 101 is dropped with no resync: unversioned, it confirmed nothing', () => {
    transport.serverEmits(
      'token:veiledLightsChanged',
      veiledLightsChanged([veiledTorch({ bright: 101 })]),
    );

    expect(veiledOf(tableUpdates)).toEqual([]);
    expect(transport.pendingAcksOf('board:sync')).toBe(0);
  });

  it('the veiled lights of another table are not this one', () => {
    const event = veiledLightsChanged([veiledTorch()], { campaignId: QUELM.id });

    transport.serverEmits('token:veiledLightsChanged', event);

    expect(veiledOf(tableUpdates)).toEqual([]);
  });
});

describe('document:tabChanged of a table visit', () => {
  let transport: RealtimeTransportFake;
  let tableUpdates: TableSessionUpdate[];

  beforeEach(async () => {
    transport = new RealtimeTransportFake();
    tableUpdates = [];
    new RealtimeTableSessionApi(transport, () => ACTION_ID).open(VHARN.id, (update) =>
      tableUpdates.push(update),
    );
    transport.lifecycle({ kind: 'connected' });
    await transport.answerAck({ ok: true, state: vharnState() });
    await transport.answerAck({ ok: true, state: vharnBoard() }, 'board:sync');
  });

  function tabChangesOf(updates: readonly TableSessionUpdate[]): TableSessionUpdate[] {
    return updates.filter(({ kind }) => kind === 'documentTabChanged');
  }

  it('a valid document:tabChanged of this table becomes a documentTabChanged update', () => {
    const event = documentTabChanged({ campaignId: VHARN.id, version: 4 });

    transport.serverEmits('document:tabChanged', event);

    expect(tabChangesOf(tableUpdates)).toEqual([{ kind: 'documentTabChanged', event }]);
  });

  it('a document:tabChanged of another table is not this one', () => {
    transport.serverEmits('document:tabChanged', documentTabChanged({ campaignId: QUELM.id }));

    expect(tabChangesOf(tableUpdates)).toEqual([]);
  });

  it('a document:tabChanged without a version is dropped, with no resync and the visit still live', () => {
    const noVersion: Partial<DocumentTabChangedDto> = documentTabChanged({ campaignId: VHARN.id });
    delete noVersion.version;

    transport.serverEmits('document:tabChanged', noVersion);
    transport.serverEmits('board:pinged', boardPinged());

    expect(tabChangesOf(tableUpdates)).toEqual([]);
    expect(transport.pendingAcksOf('board:sync')).toBe(0);
    expect(tableUpdates.at(-1)).toEqual({ kind: 'pinged', event: boardPinged() });
  });
});

/** A payload of another table that writes down every field read from it: a parse reads them all,
 *  the campaign check only `campaignId`. */
function foreignPayload(reads: Set<string>): object {
  const fields = { ...boardPinged({ campaignId: QUELM.id }), version: 9, sceneId: TORRE_SCENE.id };
  return new Proxy(fields, {
    get: (target, key, receiver) => {
      reads.add(String(key));
      return Reflect.get(target, key, receiver);
    },
    ownKeys: (target) => {
      reads.add('<keys>');
      return Reflect.ownKeys(target);
    },
  });
}

describe('order and filter of the events of a table visit', () => {
  let transport: RealtimeTransportFake;

  beforeEach(async () => {
    transport = new RealtimeTransportFake();
    const handle = new RealtimeTableSessionApi(transport, () => ACTION_ID).open(VHARN.id, () => {});
    handle.followCharacters(() => {});
    transport.lifecycle({ kind: 'connected' });
    await transport.answerAck({ ok: true, state: vharnState() });
  });

  it('an event of another table reads only its campaignId, never its DTO, on every event the visit hears', () => {
    const events = transport.listenedEvents();
    expect(events.length).toBeGreaterThan(30);
    for (const event of events) {
      const reads = new Set<string>();
      transport.serverEmits(event, foreignPayload(reads));
      expect({ event, reads: [...reads] }).toEqual({ event, reads: ['campaignId'] });
    }
    expect(transport.pendingAcksOf('board:sync')).toBe(1);
  });
});
