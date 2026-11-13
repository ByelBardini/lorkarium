import { beforeEach, describe, expect, it } from 'vitest';
import { linkAccount } from '@/app/account-link';
import { AccountRealtime } from '@/services/account-realtime';
import { createDirectMessagesStore } from '@/stores/direct-messages-store';
import { createFriendsStore } from '@/stores/friends-store';
import { createSessionStore } from '@/stores/session-store';
import { ANA } from '../support/auth-api-fake';
import { DirectMessageCommandsFake } from '../support/direct-message-commands-fake';
import { FriendsApiFake } from '../support/friends-api-fake';
import { BIA, dmSent, friendsOverview } from '../support/friends-fixtures';
import { InteractionClockFake } from '../support/interaction-clock-fake';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import { StorageFake } from '../support/storage-fake';

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('linkAccount', () => {
  let transport: RealtimeTransportFake;
  let sessionStore: ReturnType<typeof createSessionStore>;
  let api: FriendsApiFake;
  let storage: StorageFake;
  let deps: Parameters<typeof linkAccount>[0];

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    sessionStore = createSessionStore();
    api = new FriendsApiFake();
    storage = new StorageFake();
    deps = {
      sessionStore,
      transport,
      accountRealtime: new AccountRealtime(transport, () => sessionStore.getState().signedOut()),
      friends: createFriendsStore(api),
      directMessages: createDirectMessagesStore({
        commands: new DirectMessageCommandsFake(),
        storage,
        clock: new InteractionClockFake(),
      }),
    };
    linkAccount(deps);
  });

  it('signing in connects the account socket; with no table open', () => {
    sessionStore.getState().signedIn(ANA);
    expect(transport.connects).toBe(1);
    expect(deps.directMessages.getState().accountId).toBe(ANA.id);
  });

  it('the connection reads the friends and asks their presence', async () => {
    sessionStore.getState().signedIn(ANA);
    transport.lifecycle({ kind: 'connected' });
    await settle();
    expect(deps.friends.getState().overview).toEqual(friendsOverview());
    expect(transport.pendingAcksOf('presence:sync')).toBe(1);
  });

  it('a dm:sent on the socket reaches the conversations', () => {
    sessionStore.getState().signedIn({ ...ANA, id: dmSent().toUserId });
    transport.serverEmits('dm:sent', dmSent({ text: 'oi' }));
    const conversation = deps.directMessages.getState().conversations[BIA.userId];
    expect(conversation?.messages.map(({ text }) => text)).toEqual(['oi']);
  });

  it('signing out disconnects and forgets friends and conversations', async () => {
    sessionStore.getState().signedIn({ ...ANA, id: dmSent().toUserId });
    transport.lifecycle({ kind: 'connected' });
    await settle();
    transport.serverEmits('dm:sent', dmSent());
    sessionStore.getState().signedOut();
    expect(transport.disconnects).toBe(1);
    expect(deps.friends.getState().overview).toBeNull();
    expect(storage.values.size).toBe(0);
  });

  it('the socket refusing the session signs the account out', () => {
    sessionStore.getState().signedIn(ANA);
    transport.lifecycle({ kind: 'connect_failed', code: 'UNAUTHENTICATED', willRetry: false });
    expect(sessionStore.getState().session.status).toBe('anonymous');
    expect(transport.disconnects).toBe(1);
  });
});
