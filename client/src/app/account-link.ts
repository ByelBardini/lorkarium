import type { StoreApi } from 'zustand/vanilla';
import type { AccountRealtime } from '@/services/account-realtime';
import { subscribeDirectMessageEvents } from '@/services/direct-message-events';
import { subscribeFriendsEvents } from '@/services/friends-events';
import type { RealtimeTransport, Unsubscribe } from '@/services/realtime-transport';
import { followAccountSession, type AccountSessionReactions } from '@/stores/account-session';
import type { DirectMessagesStore } from '@/stores/direct-messages-store';
import type { FriendsStore } from '@/stores/friends-store';
import type { SessionStore } from '@/stores/session-store';

export type AccountLinkDeps = Readonly<{
  sessionStore: StoreApi<SessionStore>;
  transport: RealtimeTransport;
  accountRealtime: AccountRealtime;
  friends: StoreApi<FriendsStore>;
  directMessages: StoreApi<DirectMessagesStore>;
}>;

/** Ties the account to its socket and stores: signing in reads the device's conversations and
 *  connects (each `connected` reads the friends and their presence again); signing out
 *  disconnects and forgets the friends and the conversations of this device.
 *
 *  Example: `linkAccount({ sessionStore, transport: realtime, accountRealtime, friends, directMessages })` */
export function linkAccount(deps: AccountLinkDeps): Unsubscribe {
  const { accountRealtime, friends, directMessages } = deps;
  const subscriptions = [
    subscribeFriendsEvents(deps.transport, accountRealtime, (event) =>
      friends.getState().apply(event),
    ),
    subscribeDirectMessageEvents(deps.transport, (event) => directMessages.getState().apply(event)),
    followAccountSession(deps.sessionStore, accountReactions(deps)),
  ];
  return () => {
    for (const unsubscribe of subscriptions) unsubscribe();
  };
}

function accountReactions({
  accountRealtime,
  friends,
  directMessages,
}: AccountLinkDeps): AccountSessionReactions {
  return {
    signedIn: (user) => {
      directMessages.getState().signIn(user.id);
      accountRealtime.start();
    },
    signedOut: () => {
      accountRealtime.stop();
      friends.getState().reset();
      directMessages.getState().signOut();
    },
  };
}
