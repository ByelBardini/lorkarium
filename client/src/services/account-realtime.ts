import type { RealtimeLifecycle, RealtimeTransport, Unsubscribe } from './realtime-transport';

/** `idle` before `start` and after `stop`; `offline` when the connection gave up (refused, or
 *  closed by the server) and will not come back on its own. */
export type AccountRealtimeStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'offline';

const UNAUTHENTICATED_CODE = 'UNAUTHENTICATED';

/** The connection of the signed-in account: it owns `connect`/`disconnect` of the one socket;
 *  the open tables, friends and direct messages only ride it.
 *
 *  `onSessionRefused` runs when the server refuses the cookie at connect (the session fell).
 *
 *  Example: `const account = new AccountRealtime(transport, () => sessionStore.getState().signedOut()); account.start()` */
export class AccountRealtime {
  private current: AccountRealtimeStatus = 'idle';
  private readonly statusListeners = new Set<(status: AccountRealtimeStatus) => void>();
  private readonly connectedListeners = new Set<() => void>();
  private stopLifecycle: Unsubscribe | null = null;

  constructor(
    private readonly transport: RealtimeTransport,
    private readonly onSessionRefused: () => void,
  ) {}

  /** Signed in: opens the socket once; calling it again while started does nothing. */
  start(): void {
    if (this.stopLifecycle) return;
    this.stopLifecycle = this.transport.onLifecycle((change) => this.onLifecycle(change));
    this.setStatus('connecting');
    this.transport.connect();
  }

  /** Signed out: closes the socket, whatever table is still open. */
  stop(): void {
    if (!this.stopLifecycle) return;
    this.stopLifecycle();
    this.stopLifecycle = null;
    this.transport.disconnect();
    this.setStatus('idle');
  }

  status(): AccountRealtimeStatus {
    return this.current;
  }

  onStatus(listener: (status: AccountRealtimeStatus) => void): Unsubscribe {
    this.statusListeners.add(listener);
    return () => void this.statusListeners.delete(listener);
  }

  /** Every `connected`, reconnections included: where account state is asked again. */
  onConnected(listener: () => void): Unsubscribe {
    this.connectedListeners.add(listener);
    return () => void this.connectedListeners.delete(listener);
  }

  private onLifecycle(change: RealtimeLifecycle): void {
    if (change.kind === 'connected') {
      this.setStatus('live');
      for (const listener of [...this.connectedListeners]) listener();
      return;
    }
    if (change.willRetry) return this.setStatus('reconnecting');
    this.setStatus('offline');
    if (change.kind === 'connect_failed' && change.code === UNAUTHENTICATED_CODE) {
      this.onSessionRefused();
    }
  }

  private setStatus(status: AccountRealtimeStatus): void {
    if (status === this.current) return;
    this.current = status;
    for (const listener of [...this.statusListeners]) listener(status);
  }
}
