import {
  PRESENCE_EVENTS,
  friendsChangedDto,
  presenceFriendChangedDto,
  presenceSyncAckDto,
  type FriendPresenceDto,
  type PresenceFriendChangedDto,
} from '@lorkarium/contracts';
import type { AccountRealtime } from './account-realtime';
import type { RealtimeTransport, Unsubscribe } from './realtime-transport';

/** What reaches the friends store from the account socket, already validated. */
export type FriendsEvent =
  /** The answer of `presence:sync`, after every (re)connection: every friend's presence. */
  | Readonly<{ kind: 'presenceSynced'; friends: readonly FriendPresenceDto[] }>
  | Readonly<{ kind: 'friendChanged'; event: PresenceFriendChangedDto }>
  /** Something in the lists changed (a request, an accept, a removal, a block): read again. */
  | Readonly<{ kind: 'friendsChanged' }>;

// Same patience as every realtime ack.
const SYNC_ACK_TIMEOUT_MS = 5000;

/** Subscribes the friends events of the account socket and asks `presence:sync` on every
 *  `connected`; a payload outside its DTO, a refused sync or one with no ack drops silently (the
 *  next connection asks again). A `friendsChanged` follows each sync too: a change missed while
 *  the socket was down is read again. A `friends:changed` from the server does the same, sync
 *  included.
 *
 *  Example: `const stop = subscribeFriendsEvents(transport, account, (event) => friends.getState().apply(event))` */
export function subscribeFriendsEvents(
  transport: RealtimeTransport,
  account: AccountRealtime,
  listener: (event: FriendsEvent) => void,
): Unsubscribe {
  const subscriptions = [
    account.onConnected(() => void syncPresence(transport, listener)),
    transport.on(PRESENCE_EVENTS.friendChanged, (payload) => {
      const parsed = presenceFriendChangedDto.safeParse(payload);
      if (parsed.success) listener({ kind: 'friendChanged', event: parsed.data });
    }),
    // A new friendship sends no `presence:friendChanged`, so the presence is asked again too.
    transport.on(PRESENCE_EVENTS.friendsChanged, (payload) => {
      if (friendsChangedDto.safeParse(payload).success) void syncPresence(transport, listener);
    }),
  ];
  return () => {
    for (const unsubscribe of subscriptions) unsubscribe();
  };
}

async function syncPresence(
  transport: RealtimeTransport,
  listener: (event: FriendsEvent) => void,
): Promise<void> {
  listener({ kind: 'friendsChanged' });
  try {
    const answer = await transport.emitWithAck(
      PRESENCE_EVENTS.sync,
      undefined,
      SYNC_ACK_TIMEOUT_MS,
    );
    const parsed = presenceSyncAckDto.safeParse(answer);
    if (parsed.success && parsed.data.ok) {
      listener({ kind: 'presenceSynced', friends: parsed.data.friends });
    }
  } catch {
    // No ack: the socket fell meanwhile, and its next `connected` asks again.
  }
}
