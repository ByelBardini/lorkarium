import type { FriendsChange, FriendsChangedPort } from '../../modules/friends/friends-changed.port';
import type { RealtimeServer } from '../../realtime/realtime-server';
import { userRoom } from '../../realtime/rooms';

/** `friends:changed` (`{ at }`, never the reason) to the `user:<id>` room of each account.
 *
 *  Example: `await new SocketIoFriendsChanged(realtime.io).friendsChanged({ userIds, at })` */
export class SocketIoFriendsChanged implements FriendsChangedPort {
  constructor(private readonly io: RealtimeServer) {}

  async friendsChanged({ userIds, at }: FriendsChange): Promise<void> {
    if (userIds.length === 0) return;
    this.io.to(userIds.map(userRoom)).emit('friends:changed', { at: at.toISOString() });
  }
}
