import type { PresenceFriendChangedDto } from '@lorkarium/contracts';
import type { AccountPresencePublisherPort } from '../../modules/account-presence/account-presence-publisher.port';
import type { RealtimeServer } from '../../realtime/realtime-server';
import { userRoom } from '../../realtime/rooms';

/** `presence:friendChanged` to the `user:<id>` room of each friend (every tab of each).
 *
 *  Example: `new SocketIoAccountPresencePublisher(realtime.io).friendChanged([anaId], event)` */
export class SocketIoAccountPresencePublisher implements AccountPresencePublisherPort {
  constructor(private readonly io: RealtimeServer) {}

  friendChanged(friendIds: readonly string[], event: PresenceFriendChangedDto): void {
    this.io.to(friendIds.map(userRoom)).emit('presence:friendChanged', event);
  }
}
