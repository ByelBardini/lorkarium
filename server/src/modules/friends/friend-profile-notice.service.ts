import type { ClockPort } from '../auth/clock.port';
import type { FriendsChangedPort } from './friends-changed.port';
import type { FriendshipsDao } from './friendships.dao';

export type FriendProfileNoticeDeps = Readonly<{
  friendships: Pick<FriendshipsDao, 'friendIdsOf'>;
  changed: FriendsChangedPort;
  clock: ClockPort;
}>;

/** A saved profile (nickname, color, photo) shows in every friend's list: each friend hears
 *  `friends:changed` and reads `GET /api/friends` again. Implements the profiles module's
 *  `ProfileChangedPort`, beside the live table session's.
 *
 *  Example: `await new FriendProfileNoticeService(deps).profileChanged(biaId)` */
export class FriendProfileNoticeService {
  constructor(private readonly deps: FriendProfileNoticeDeps) {}

  async profileChanged(userId: string): Promise<void> {
    const friendIds = await this.deps.friendships.friendIdsOf(userId);
    if (friendIds.length === 0) return;
    await this.deps.changed.friendsChanged({ userIds: friendIds, at: this.deps.clock.now() });
  }
}
