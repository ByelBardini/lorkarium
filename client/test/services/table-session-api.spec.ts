import { beforeEach, describe, expect, it } from 'vitest';
import {
  RealtimeTableSessionApi,
  type TableSessionHandle,
  type TableSessionUpdate,
} from '@/services/table-session-api';
import { QUELM, VHARN } from '../support/campaigns-api-fake';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import { biaJoined, biaLeft, vharnState } from '../support/table-session-fixtures';

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
    expect(transport.sent.map(({ event }) => event)).toEqual(['session:join', 'session:join']);
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
});
