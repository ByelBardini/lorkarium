import { useMemo } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { ProfileCardApi } from '@/services/profile-card-api';
import type { DirectMessagesStore } from '@/stores/direct-messages-store';
import type { FriendsStore } from '@/stores/friends-store';
import { ProfileCardContext } from './profile-card-deps';

export type ProfileCardProviderProps = Readonly<{
  deps: Readonly<{
    profileCardApi: ProfileCardApi;
    friends: StoreApi<FriendsStore>;
    directMessages: StoreApi<DirectMessagesStore>;
  }>;
  viewerId: string;
  children: React.ReactNode;
}>;

/** Lets every name below it (roster, chat, friends) open the profile card of the signed-in account.
 *
 *  Example: `<ProfileCardProvider deps={deps} viewerId={user.id}>…</ProfileCardProvider>` */
export function ProfileCardProvider({
  deps,
  viewerId,
  children,
}: ProfileCardProviderProps): React.JSX.Element {
  const { profileCardApi, friends, directMessages } = deps;
  const value = useMemo(
    () => ({ api: profileCardApi, friends, directMessages, viewerId }),
    [profileCardApi, friends, directMessages, viewerId],
  );
  return <ProfileCardContext value={value}>{children}</ProfileCardContext>;
}
