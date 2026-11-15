import { createContext, use } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { ProfileCardApi } from '@/services/profile-card-api';
import type { DirectMessagesStore } from '@/stores/direct-messages-store';
import type { FriendsStore } from '@/stores/friends-store';

/** What the profile card reads and acts on: the card, the friendship commands and the account
 *  reading it (`viewerId`: its own card has no actions). */
export type ProfileCardDeps = Readonly<{
  api: ProfileCardApi;
  friends: StoreApi<FriendsStore>;
  directMessages: StoreApi<DirectMessagesStore>;
  viewerId: string;
}>;

export const ProfileCardContext = createContext<ProfileCardDeps | null>(null);

/** The profile card's dependencies, or `null` outside a signed-in shell (the name stays text).
 *
 *  Example: `const deps = useProfileCardDeps(); if (deps) await deps.api.card(userId)` */
export function useProfileCardDeps(): ProfileCardDeps | null {
  return use(ProfileCardContext);
}
