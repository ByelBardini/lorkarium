import type { StoreApi } from 'zustand/vanilla';
import type { AccountRealtime } from '@/services/account-realtime';
import type { DirectMessagesStore } from '@/stores/direct-messages-store';
import type { FriendsStore } from '@/stores/friends-store';
import type { PresenceChoiceStore } from '@/stores/presence-choice-store';

/** What the friends screen reads and acts on. */
export type FriendsScreenDeps = Readonly<{
  friends: StoreApi<FriendsStore>;
  directMessages: StoreApi<DirectMessagesStore>;
  accountRealtime: AccountRealtime;
  presenceChoice: StoreApi<PresenceChoiceStore>;
  now: () => Date;
}>;

/** A sentence shown where the person acted: `error` goes out as `role="alert"`. */
export type FriendsNotice = Readonly<{ text: string; error: boolean }>;

export type ShowFriendsNotice = (notice: FriendsNotice) => void;
