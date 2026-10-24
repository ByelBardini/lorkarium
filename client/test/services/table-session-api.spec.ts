import { beforeEach, describe, expect, it } from 'vitest';
import {
  RealtimeTableSessionApi,
  type TableSessionHandle,
  type TableSessionUpdate,
} from '@/services/table-session-api';
import { QUELM, VHARN } from '../support/campaigns-api-fake';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import {
  BIA_AT_TABLE,
  biaJoined,
  biaLeft,
  biaUpdated,
  vharnDeleted,
  vharnRenamed,
  vharnState,
} from '../support/table-session-fixtures';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';

describe('RealtimeTableSessionApi', () => {
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

  async function connectAndAnswer(answer: unknown): Promise<void> {
    transport.lifecycle({ kind: 'connected' });
    await transport.answerAck(answer);
  }

  it('opening connects and, once connected, sends session:join with the generated action id', () => {
    transport.lifecycle({ kind: 'connected' });
    expect(transport.connects).toBe(1);
    expect(transport.sent).toEqual([
      { event: 'session:join', payload: { actionId: ACTION_ID, campaignId: VHARN.id } },
    ]);
  });

  it('a successful join ack delivers the snapshot and turns the status live', async () => {
    await connectAndAnswer({ ok: true, state: vharnState() });
    expect(updates).toEqual([
      { kind: 'status', status: 'connecting' },
      { kind: 'state', state: vharnState() },
      { kind: 'status', status: 'live' },
    ]);
  });

  it.each([
    ['CAMPAIGN_NOT_FOUND', 'not_found'],
    ['UNAUTHENTICATED', 'unauthenticated'],
    ['INTERNAL_ERROR', 'unexpected'],
  ])('a join refused with %s fails as %s', async (code, failure) => {
    await connectAndAnswer({ ok: false, error: { code, message: 'x' } });
    expect(updates.at(-1)).toEqual({ kind: 'failed', failure });
  });

  it('a connection refused with UNAUTHENTICATED fails as unauthenticated', () => {
    transport.lifecycle({ kind: 'connect_failed', code: 'UNAUTHENTICATED', willRetry: false });
    expect(updates.at(-1)).toEqual({ kind: 'failed', failure: 'unauthenticated' });
  });

  it('an ack outside the DTO fails as unexpected', async () => {
    await connectAndAnswer({ ok: true, state: { ...vharnState(), version: -1 } });
    expect(updates.at(-1)).toEqual({ kind: 'failed', failure: 'unexpected' });
  });

  it('a join ack that never arrives fails as offline', async () => {
    transport.lifecycle({ kind: 'connected' });
    await transport.timeOutAck();
    expect(updates.at(-1)).toEqual({ kind: 'failed', failure: 'offline' });
  });

  it('a valid memberJoined of this table reaches the listener', async () => {
    await connectAndAnswer({ ok: true, state: vharnState() });
    transport.serverEmits('session:memberJoined', biaJoined());
    transport.serverEmits('session:memberLeft', biaLeft());
    expect(updates.slice(3)).toEqual([
      { kind: 'memberJoined', event: biaJoined() },
      { kind: 'memberLeft', event: biaLeft() },
    ]);
  });

  it('an event of another table or outside the DTO is ignored', async () => {
    await connectAndAnswer({ ok: true, state: vharnState() });
    transport.serverEmits('session:memberJoined', biaJoined({ campaignId: QUELM.id }));
    transport.serverEmits('session:memberLeft', { ...biaLeft(), userId: 'bia' });
    expect(updates).toHaveLength(3);
  });

  it('a dropped connection goes reconnecting, and coming back rejoins for a fresh snapshot', async () => {
    await connectAndAnswer({ ok: true, state: vharnState() });
    transport.lifecycle({ kind: 'disconnected', willRetry: true });
    await connectAndAnswer({ ok: true, state: vharnState({ version: 4 }) });
    expect(updates.slice(3)).toEqual([
      { kind: 'status', status: 'reconnecting' },
      { kind: 'state', state: vharnState({ version: 4 }) },
      { kind: 'status', status: 'live' },
    ]);
    expect(transport.sent.map(({ event }) => event)).toEqual([
      'session:join',
      'board:sync',
      'session:join',
      'board:sync',
    ]);
  });

  it('closing sends session:leave and disconnects; later events no longer reach the listener', async () => {
    await connectAndAnswer({ ok: true, state: vharnState() });
    handle.close();
    transport.serverEmits('session:memberJoined', biaJoined());
    transport.lifecycle({ kind: 'disconnected', willRetry: false });
    expect(transport.sent.at(-1)).toEqual({
      event: 'session:leave',
      payload: { actionId: ACTION_ID, campaignId: VHARN.id },
    });
    expect(transport.disconnects).toBe(1);
    expect(updates).toHaveLength(3);
  });

  it('a join ack landing after close is not delivered', async () => {
    transport.lifecycle({ kind: 'connected' });
    handle.close();
    await transport.answerAck({ ok: true, state: vharnState() });
    expect(updates).toEqual([{ kind: 'status', status: 'connecting' }]);
  });

  describe('activity', () => {
    const away = {
      campaignId: VHARN.id,
      version: 4,
      userId: BIA_AT_TABLE.userId,
      awaySince: '2026-10-22T12:00:00.000Z',
      at: '2026-10-22T12:04:00.000Z',
    };

    it('setAway(true) sends session:setActivity with away true', async () => {
      await connectAndAnswer({ ok: true, state: vharnState() });
      transport.sent.length = 0;

      handle.setAway(true);

      expect(transport.sent).toEqual([
        {
          event: 'session:setActivity',
          payload: { actionId: ACTION_ID, campaignId: VHARN.id, away: true },
        },
      ]);
    });

    it('a valid memberActivity of this table reaches the listener', async () => {
      await connectAndAnswer({ ok: true, state: vharnState() });

      transport.serverEmits('session:memberActivity', away);

      expect(updates.at(-1)).toEqual({ kind: 'memberActivity', event: away });
    });

    it('a memberActivity of another table is ignored', async () => {
      await connectAndAnswer({ ok: true, state: vharnState() });
      const count = updates.length;

      transport.serverEmits('session:memberActivity', { ...away, campaignId: QUELM.id });

      expect(updates).toHaveLength(count);
    });

    it('rejoining after a reconnection while away tells the server again', async () => {
      await connectAndAnswer({ ok: true, state: vharnState() });
      handle.setAway(true);
      transport.lifecycle({ kind: 'disconnected', willRetry: true });
      transport.sent.length = 0;

      await connectAndAnswer({ ok: true, state: vharnState() });

      expect(transport.sent.map(({ event }) => event)).toEqual(
        expect.arrayContaining(['session:join', 'session:setActivity']),
      );
      expect(transport.sent.find(({ event }) => event === 'session:setActivity')?.payload).toEqual({
        actionId: ACTION_ID,
        campaignId: VHARN.id,
        away: true,
      });
    });
  });

  describe('profile', () => {
    it('a valid memberUpdated of this table reaches the listener', async () => {
      await connectAndAnswer({ ok: true, state: vharnState() });

      transport.serverEmits('session:memberUpdated', biaUpdated());

      expect(updates.at(-1)).toEqual({ kind: 'memberUpdated', event: biaUpdated() });
    });

    it('a memberUpdated of another table is ignored', async () => {
      await connectAndAnswer({ ok: true, state: vharnState() });
      const count = updates.length;

      transport.serverEmits('session:memberUpdated', biaUpdated({ campaignId: QUELM.id }));

      expect(updates).toHaveLength(count);
    });

    it('a memberUpdated outside the DTO (a color that does not exist) is ignored', async () => {
      await connectAndAnswer({ ok: true, state: vharnState() });
      const count = updates.length;
      const { member } = biaUpdated();

      transport.serverEmits('session:memberUpdated', {
        ...biaUpdated(),
        member: { ...member, color: 'pink' },
      });

      expect(updates).toHaveLength(count);
    });
  });

  describe('campaign', () => {
    it('a valid campaignUpdated of this table reaches the listener', async () => {
      await connectAndAnswer({ ok: true, state: vharnState() });

      transport.serverEmits('session:campaignUpdated', vharnRenamed());

      expect(updates.at(-1)).toEqual({ kind: 'campaignUpdated', event: vharnRenamed() });
    });

    it('a valid campaignDeleted of this table reaches the listener', async () => {
      await connectAndAnswer({ ok: true, state: vharnState() });

      transport.serverEmits('session:campaignDeleted', vharnDeleted());

      expect(updates.at(-1)).toEqual({ kind: 'campaignDeleted', event: vharnDeleted() });
    });

    it.each([
      ['session:campaignUpdated', vharnRenamed({ campaignId: QUELM.id })],
      ['session:campaignDeleted', vharnDeleted({ campaignId: QUELM.id })],
    ])('a %s of another table is ignored', async (event, payload) => {
      await connectAndAnswer({ ok: true, state: vharnState() });
      const count = updates.length;

      transport.serverEmits(event, payload);

      expect(updates).toHaveLength(count);
    });

    it('a campaignUpdated outside the DTO (a status that does not exist) is ignored', async () => {
      await connectAndAnswer({ ok: true, state: vharnState() });
      const count = updates.length;
      const event = vharnRenamed();

      transport.serverEmits('session:campaignUpdated', {
        ...event,
        campaign: { ...event.campaign, status: 'Recrutando' },
      });

      expect(updates).toHaveLength(count);
    });
  });
});

describe('RealtimeTableSessionApi with several tables on one connection', () => {
  let transport: RealtimeTransportFake;
  let api: RealtimeTableSessionApi;
  let vharnUpdates: TableSessionUpdate[];
  let quelmUpdates: TableSessionUpdate[];

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    api = new RealtimeTableSessionApi(transport, () => ACTION_ID);
    vharnUpdates = [];
    quelmUpdates = [];
  });

  function openVharn(): TableSessionHandle {
    return api.open(VHARN.id, (update) => vharnUpdates.push(update));
  }

  function openQuelm(): TableSessionHandle {
    return api.open(QUELM.id, (update) => quelmUpdates.push(update));
  }

  function joinsSent(): unknown[] {
    return transport.sent
      .filter(({ event }) => event === 'session:join')
      .map(({ payload }) => payload);
  }

  it('opening QUELM after the connection is up sends its session:join at once without connecting again', async () => {
    openVharn();
    transport.lifecycle({ kind: 'connected' });
    await transport.answerAck({ ok: true, state: vharnState() });
    openQuelm();
    expect(transport.connects).toBe(1);
    expect(joinsSent()).toEqual([
      { actionId: ACTION_ID, campaignId: VHARN.id },
      { actionId: ACTION_ID, campaignId: QUELM.id },
    ]);
  });

  it('two tables opened while connecting both send session:join on connected, over one connect', () => {
    openVharn();
    openQuelm();
    expect(joinsSent()).toEqual([]);
    transport.lifecycle({ kind: 'connected' });
    expect(transport.connects).toBe(1);
    expect(joinsSent()).toEqual([
      { actionId: ACTION_ID, campaignId: VHARN.id },
      { actionId: ACTION_ID, campaignId: QUELM.id },
    ]);
  });

  it('a memberJoined of QUELM reaches only the QUELM listener, and one of VHARN only the VHARN one', async () => {
    openVharn();
    openQuelm();
    transport.lifecycle({ kind: 'connected' });
    await transport.answerAck({ ok: true, state: vharnState() });
    await transport.answerAck({ ok: true, state: vharnState({ campaignId: QUELM.id }) });
    transport.serverEmits('session:memberJoined', biaJoined({ campaignId: QUELM.id }));
    transport.serverEmits('session:memberJoined', biaJoined());
    expect(quelmUpdates.at(-1)).toEqual({
      kind: 'memberJoined',
      event: biaJoined({ campaignId: QUELM.id }),
    });
    expect(vharnUpdates.at(-1)).toEqual({ kind: 'memberJoined', event: biaJoined() });
    expect(vharnUpdates.filter(({ kind }) => kind === 'memberJoined')).toHaveLength(1);
  });

  it('a drop with retry puts both tables reconnecting, and coming back rejoins both and turns them live', async () => {
    openVharn();
    openQuelm();
    transport.lifecycle({ kind: 'connected' });
    await transport.answerAck({ ok: true, state: vharnState() });
    await transport.answerAck({ ok: true, state: vharnState({ campaignId: QUELM.id }) });
    transport.lifecycle({ kind: 'disconnected', willRetry: true });
    expect(vharnUpdates.at(-1)).toEqual({ kind: 'status', status: 'reconnecting' });
    expect(quelmUpdates.at(-1)).toEqual({ kind: 'status', status: 'reconnecting' });
    transport.lifecycle({ kind: 'connected' });
    await transport.answerAck({ ok: true, state: vharnState({ version: 4 }) });
    await transport.answerAck({ ok: true, state: vharnState({ campaignId: QUELM.id }) });
    expect(joinsSent()).toHaveLength(4);
    expect(vharnUpdates.at(-1)).toEqual({ kind: 'status', status: 'live' });
    expect(quelmUpdates.at(-1)).toEqual({ kind: 'status', status: 'live' });
  });

  it('closing VHARN sends its session:leave and keeps the connection, and QUELM still receives events', async () => {
    const vharn = openVharn();
    openQuelm();
    transport.lifecycle({ kind: 'connected' });
    await transport.answerAck({ ok: true, state: vharnState() });
    await transport.answerAck({ ok: true, state: vharnState({ campaignId: QUELM.id }) });
    vharn.close();
    transport.serverEmits('session:memberLeft', biaLeft({ campaignId: QUELM.id }));
    expect(transport.sent.at(-1)).toEqual({
      event: 'session:leave',
      payload: { actionId: ACTION_ID, campaignId: VHARN.id },
    });
    expect(transport.disconnects).toBe(0);
    expect(quelmUpdates.at(-1)).toEqual({
      kind: 'memberLeft',
      event: biaLeft({ campaignId: QUELM.id }),
    });
  });

  it('closing the last open table disconnects, and opening one again connects again', () => {
    const vharn = openVharn();
    const quelm = openQuelm();
    transport.lifecycle({ kind: 'connected' });
    vharn.close();
    quelm.close();
    expect(transport.disconnects).toBe(1);
    openVharn();
    expect(transport.connects).toBe(2);
  });

  it('a join refused with TOO_MANY_TABLES fails as too_many_tables', async () => {
    openVharn();
    transport.lifecycle({ kind: 'connected' });
    await transport.answerAck({ ok: false, error: { code: 'TOO_MANY_TABLES', message: 'x' } });
    expect(vharnUpdates.at(-1)).toEqual({ kind: 'failed', failure: 'too_many_tables' });
  });
});
