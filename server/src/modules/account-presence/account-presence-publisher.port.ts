import type { PresenceFriendChangedDto } from '@lorkarium/contracts';

/** Where a presence change goes out: the `user:<id>` room of each friend, every tab. */
export interface AccountPresencePublisherPort {
  friendChanged(friendIds: readonly string[], event: PresenceFriendChangedDto): void;
}
