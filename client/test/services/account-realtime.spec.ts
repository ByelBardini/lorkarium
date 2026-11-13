import { beforeEach, describe, expect, it } from 'vitest';
import { AccountRealtime, type AccountRealtimeStatus } from '@/services/account-realtime';
import { RealtimeTableSessionApi } from '@/services/table-session-api';
import { VHARN } from '../support/campaigns-api-fake';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import { vharnState } from '../support/table-session-fixtures';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';

describe('AccountRealtime', () => {
  let transport: RealtimeTransportFake;
  let refusals: number;
  let account: AccountRealtime;
  let statuses: AccountRealtimeStatus[];

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    refusals = 0;
    statuses = [];
    account = new AccountRealtime(transport, () => (refusals += 1));
    account.onStatus((status) => statuses.push(status));
  });

  function joinsSent(): number {
    return transport.sent.filter(({ event }) => event === 'session:join').length;
  }

  it('start connects once, even when called again while started', () => {
    account.start();
    account.start();
    expect(transport.connects).toBe(1);
    expect(account.status()).toBe('connecting');
  });

  it('connected turns live and runs every onConnected listener, again on each reconnection', () => {
    let connections = 0;
    account.onConnected(() => (connections += 1));
    account.start();
    transport.lifecycle({ kind: 'connected' });
    transport.lifecycle({ kind: 'disconnected', willRetry: true });
    transport.lifecycle({ kind: 'connected' });
    expect(connections).toBe(2);
    expect(statuses).toEqual(['connecting', 'live', 'reconnecting', 'live']);
  });

  it('stop disconnects and goes idle; later lifecycle changes no longer reach it', () => {
    let connections = 0;
    account.onConnected(() => (connections += 1));
    account.start();
    account.stop();
    transport.lifecycle({ kind: 'connected' });
    expect(transport.disconnects).toBe(1);
    expect(account.status()).toBe('idle');
    expect(connections).toBe(0);
  });

  it('stop before any start does not touch the socket', () => {
    account.stop();
    expect(transport.disconnects).toBe(0);
  });

  it('a connect refused with UNAUTHENTICATED goes offline and reports the fallen session', () => {
    account.start();
    transport.lifecycle({ kind: 'connect_failed', code: 'UNAUTHENTICATED', willRetry: false });
    expect(account.status()).toBe('offline');
    expect(refusals).toBe(1);
  });

  it('a connect failure that retries only reconnects, without reporting the session', () => {
    account.start();
    transport.lifecycle({ kind: 'connect_failed', code: 'xhr poll error', willRetry: true });
    expect(account.status()).toBe('reconnecting');
    expect(refusals).toBe(0);
  });

  it('a drop without retry for another reason goes offline without reporting the session', () => {
    account.start();
    transport.lifecycle({ kind: 'disconnected', willRetry: false });
    expect(account.status()).toBe('offline');
    expect(refusals).toBe(0);
  });

  describe('with the tables riding the same socket', () => {
    let tables: RealtimeTableSessionApi;

    beforeEach(() => {
      tables = new RealtimeTableSessionApi(transport, () => ACTION_ID);
    });

    it('a table opened before the account connects waits for connected to send its session:join', () => {
      tables.open(VHARN.id, () => undefined);
      account.start();
      expect(joinsSent()).toBe(0);
      transport.lifecycle({ kind: 'connected' });
      expect(joinsSent()).toBe(1);
    });

    it('closing the last table keeps the account connected', async () => {
      account.start();
      transport.lifecycle({ kind: 'connected' });
      const handle = tables.open(VHARN.id, () => undefined);
      await transport.answerAck({ ok: true, state: vharnState() });
      handle.close();
      expect(transport.disconnects).toBe(0);
      expect(transport.connects).toBe(1);
    });

    it('a reconnection rejoins the live table over the one connect of the account', async () => {
      account.start();
      transport.lifecycle({ kind: 'connected' });
      tables.open(VHARN.id, () => undefined);
      await transport.answerAck({ ok: true, state: vharnState() });
      transport.lifecycle({ kind: 'disconnected', willRetry: true });
      transport.lifecycle({ kind: 'connected' });
      expect(joinsSent()).toBe(2);
      expect(transport.connects).toBe(1);
    });
  });
});
