import type { DmSendCommandDto, DmTypingCommandDto } from '@lorkarium/contracts';
import type { AccountPresenceService } from '../account-presence/account-presence.service';
import type { ClockPort } from '../auth/clock.port';
import type { FriendsChange } from '../friends/friends-changed.port';
import { canonicalPair, type FriendshipsDao } from '../friends/friendships.dao';
import { DirectMessageBo } from './direct-message.bo';
import type { DirectMessagePublisherPort } from './direct-message-publisher.port';
import { toDmSentDto, toDmTypingFromDto } from './direct-messages.mapper';

// A conversation sends many messages in a row: the friendship is read once in this window. Any
// saved change of the pair's lists forgets it first (`friendsChanged`), so a removal or a block
// counts on the very next message.
export const FRIENDSHIP_MEMORY_MS = 30_000;

export type DirectMessagesServiceDeps = Readonly<{
  friendships: Pick<FriendshipsDao, 'exists'>;
  presence: Pick<AccountPresenceService, 'isVisiblyOnline'>;
  publisher: DirectMessagePublisherPort;
  clock: ClockPort;
  newId: () => string;
}>;

// Past this many pairs the expired ones are swept, so the memory never grows with old talks.
const MEMORY_SWEEP_AT = 1000;

type Remembered = Readonly<{ friends: boolean; untilMs: number }>;

/** Direct messages and "digitando…" between friends, both visibly online. Nothing is saved: the
 *  message reaches every tab of the two accounts that is connected right now, and only them.
 *  Also a `FriendsChangedPort`, to forget what it remembers of the accounts whose lists changed.
 *
 *  Example: `const { messageId } = await directMessages.send(anaId, command)` */
export class DirectMessagesService {
  private readonly remembered = new Map<string, Remembered>();

  constructor(private readonly deps: DirectMessagesServiceDeps) {}

  async send(senderId: string, command: DmSendCommandDto): Promise<{ messageId: string }> {
    const bo = await this.ruleFor(senderId, command.toUserId);
    bo.requireDeliverable();
    const messageId = this.deps.newId();
    const at = this.deps.clock.now();
    const { toUserId, text } = command;
    this.deps.publisher.sent(toDmSentDto({ messageId, fromUserId: senderId, toUserId, text, at }));
    return { messageId };
  }

  /** "Digitando…" to the friend; anything that would refuse a message drops it silently. */
  async typing(senderId: string, { toUserId }: DmTypingCommandDto): Promise<void> {
    const bo = await this.ruleFor(senderId, toUserId);
    if (!bo.isDeliverable()) return;
    this.deps.publisher.typing(toUserId, toDmTypingFromDto(senderId, this.deps.clock.now()));
  }

  async friendsChanged({ userIds }: FriendsChange): Promise<void> {
    const changed = new Set(userIds);
    for (const key of [...this.remembered.keys()]) {
      if (key.split(':').some((userId) => changed.has(userId))) this.remembered.delete(key);
    }
  }

  private async ruleFor(senderId: string, recipientId: string): Promise<DirectMessageBo> {
    const friends = senderId !== recipientId && (await this.areFriends(senderId, recipientId));
    const { presence } = this.deps;
    return new DirectMessageBo({
      senderId,
      recipientId,
      friends,
      senderVisible: presence.isVisiblyOnline(senderId),
      recipientVisible: presence.isVisiblyOnline(recipientId),
    });
  }

  private async areFriends(senderId: string, recipientId: string): Promise<boolean> {
    const { userLow, userHigh } = canonicalPair(senderId, recipientId);
    const key = `${userLow}:${userHigh}`;
    const nowMs = this.deps.clock.now().getTime();
    const known = this.remembered.get(key);
    if (known && known.untilMs > nowMs) return known.friends;
    const friends = await this.deps.friendships.exists(senderId, recipientId);
    if (this.remembered.size >= MEMORY_SWEEP_AT) this.sweep(nowMs);
    this.remembered.set(key, { friends, untilMs: nowMs + FRIENDSHIP_MEMORY_MS });
    return friends;
  }

  private sweep(nowMs: number): void {
    for (const [key, known] of this.remembered) {
      if (known.untilMs <= nowMs) this.remembered.delete(key);
    }
  }
}
