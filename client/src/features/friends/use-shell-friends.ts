import type { StoreApi } from 'zustand/vanilla';
import type { UserMenuPresence } from '@/app/shell/user-menu';
import {
  selectDirectUnreadCount,
  useDirectMessages,
  type DirectMessagesStore,
} from '@/stores/direct-messages-store';
import { selectIncomingCount, useFriends, type FriendsStore } from '@/stores/friends-store';
import { usePresenceChoice, type PresenceChoiceStore } from '@/stores/presence-choice-store';

/** The badge of "Amigos" on the rail: received requests plus unread direct messages.
 *
 *  Example: `const friendsBadge = useFriendsBadge(deps.friends, deps.directMessages)` */
export function useFriendsBadge(
  friends: StoreApi<FriendsStore>,
  directMessages: StoreApi<DirectMessagesStore>,
): number {
  const incoming = useFriends(friends, selectIncomingCount);
  const unread = useDirectMessages(directMessages, selectDirectUnreadCount);
  return incoming + unread;
}

/** The status of the user menu, over the presence choice store.
 *
 *  Example: `<UserMenu … presence={useUserMenuPresence(deps.presenceChoice)} />` */
export function useUserMenuPresence(store: StoreApi<PresenceChoiceStore>): UserMenuPresence {
  const choice = usePresenceChoice(store, (state) => state.choice);
  const away = usePresenceChoice(store, (state) => state.away);
  const onChoose = usePresenceChoice(store, (state) => state.choose);
  return { choice, away, onChoose };
}
