import type { DmSentDto, DmTypingFromDto } from '@lorkarium/contracts';
import type { AccountPresenceService } from '../../src/modules/account-presence/account-presence.service';
import type { DirectMessagePublisherPort } from '../../src/modules/direct-messages/direct-message-publisher.port';
import { canonicalPair, type FriendshipsDao } from '../../src/modules/friends/friendships.dao';

/** Every `dm:sent` and `dm:typingFrom` the service sent, in order. */
export class DirectMessagePublisherFake implements DirectMessagePublisherPort {
  readonly sentEvents: DmSentDto[] = [];
  readonly typingEvents: { recipientId: string; event: DmTypingFromDto }[] = [];

  sent(event: DmSentDto): void {
    this.sentEvents.push(event);
  }

  typing(recipientId: string, event: DmTypingFromDto): void {
    this.typingEvents.push({ recipientId, event });
  }
}

/** Friend pairs in memory, as `FriendshipsDao.exists` reads them; `reads` counts each read. */
export class FriendshipExistsFake implements Pick<FriendshipsDao, 'exists'> {
  reads = 0;
  private readonly pairs = new Set<string>();

  befriend(oneId: string, otherId: string): void {
    this.pairs.add(keyOf(oneId, otherId));
  }

  unfriend(oneId: string, otherId: string): void {
    this.pairs.delete(keyOf(oneId, otherId));
  }

  async exists(oneId: string, otherId: string): Promise<boolean> {
    this.reads += 1;
    return this.pairs.has(keyOf(oneId, otherId));
  }
}

/** Who is visibly online (online or away, not invisible), as the account presence answers. */
export class VisiblePresenceFake implements Pick<AccountPresenceService, 'isVisiblyOnline'> {
  readonly online = new Set<string>();

  isVisiblyOnline(userId: string): boolean {
    return this.online.has(userId);
  }
}

function keyOf(oneId: string, otherId: string): string {
  const { userLow, userHigh } = canonicalPair(oneId, otherId);
  return `${userLow}:${userHigh}`;
}
