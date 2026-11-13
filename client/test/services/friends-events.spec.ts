import { beforeEach, describe, expect, it } from 'vitest';
import { AccountRealtime } from '@/services/account-realtime';
import { subscribeFriendsEvents, type FriendsEvent } from '@/services/friends-events';
import { BIA, presenceChanged } from '../support/friends-fixtures';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';

const BIA_ONLINE = { userId: BIA.userId, status: 'online', table: null } as const;

describe('subscribeFriendsEvents', () => {
  let transport: RealtimeTransportFake;
  let events: FriendsEvent[];
  let stop: () => void;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    const account = new AccountRealtime(transport, () => undefined);
    events = [];
    stop = subscribeFriendsEvents(transport, account, (event) => events.push(event));
    account.start();
  });

  it('each connected re-reads the lists and asks presence:sync with no payload', () => {
    transport.lifecycle({ kind: 'connected' });
    expect(events).toEqual([{ kind: 'friendsChanged' }]);
    expect(transport.sent).toEqual([{ event: 'presence:sync', payload: undefined }]);
  });

  it('the sync answer delivers every friend presence', async () => {
    transport.lifecycle({ kind: 'connected' });
    await transport.answerAck({ ok: true, friends: [BIA_ONLINE] }, 'presence:sync');
    expect(events.at(-1)).toEqual({ kind: 'presenceSynced', friends: [BIA_ONLINE] });
  });

  it('a reconnection asks presence:sync again', () => {
    transport.lifecycle({ kind: 'connected' });
    transport.lifecycle({ kind: 'disconnected', willRetry: true });
    transport.lifecycle({ kind: 'connected' });
    expect(transport.pendingAcksOf('presence:sync')).toBe(2);
  });

  it.each([
    ['refused', { ok: false, error: { code: 'UNAUTHENTICATED', message: 'x' } }],
    ['outside the DTO', { ok: true, friends: [{ userId: 'x' }] }],
  ])('a sync answer %s delivers nothing', async (_case, answer) => {
    transport.lifecycle({ kind: 'connected' });
    await transport.answerAck(answer, 'presence:sync');
    expect(events).toEqual([{ kind: 'friendsChanged' }]);
  });

  it('a sync with no ack delivers nothing and does not throw', async () => {
    transport.lifecycle({ kind: 'connected' });
    await transport.timeOutAck('presence:sync');
    expect(events).toEqual([{ kind: 'friendsChanged' }]);
  });

  it('presence:friendChanged valid reaches the listener; outside the DTO it drops', () => {
    transport.serverEmits('presence:friendChanged', presenceChanged());
    transport.serverEmits('presence:friendChanged', { ...presenceChanged(), status: 'busy' });
    expect(events).toEqual([{ kind: 'friendChanged', event: presenceChanged() }]);
  });

  it('friends:changed valid reaches the listener; outside the DTO it drops', () => {
    transport.serverEmits('friends:changed', { at: '2026-11-12T10:00:00.000Z' });
    transport.serverEmits('friends:changed', { reason: 'blocked' });
    expect(events).toEqual([{ kind: 'friendsChanged' }]);
  });

  // A new friendship sends no presence:friendChanged: without this the new friend stays offline.
  it('friends:changed asks presence:sync again and delivers the new presence', async () => {
    transport.serverEmits('friends:changed', { at: '2026-11-12T10:00:00.000Z' });
    expect(transport.sent).toEqual([{ event: 'presence:sync', payload: undefined }]);
    await transport.answerAck({ ok: true, friends: [BIA_ONLINE] }, 'presence:sync');
    expect(events.at(-1)).toEqual({ kind: 'presenceSynced', friends: [BIA_ONLINE] });
  });

  it('after unsubscribing nothing reaches the listener and connected asks nothing', () => {
    stop();
    transport.serverEmits('friends:changed', { at: '2026-11-12T10:00:00.000Z' });
    transport.lifecycle({ kind: 'connected' });
    expect(events).toEqual([]);
    expect(transport.sent).toEqual([]);
  });
});
