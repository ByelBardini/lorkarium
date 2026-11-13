/** A saved change of the friends lists: which accounts must read `GET /api/friends` again. */
export type FriendsChange = Readonly<{ userIds: readonly string[]; at: Date }>;

/** Told after the change is committed; the live adapter sends `friends:changed` (`{ at }`) to the
 *  `user:<id>` room of each account, every tab of it. It never says why, so a blocked account
 *  only sees the friend go away. */
export interface FriendsChangedPort {
  friendsChanged(change: FriendsChange): Promise<void>;
}
