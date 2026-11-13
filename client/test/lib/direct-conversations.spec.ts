import { describe, expect, it } from 'vitest';
import {
  directConversationStorageKey,
  directIndexStorageKey,
  emptyDirectConversation,
  friendIdOf,
  withDirectMessage,
} from '@/lib/direct-conversations';
import { BIA, CAIO, ME_ID, dmSent } from '../support/friends-fixtures';

describe('direct conversations', () => {
  it('the storage keys are per account and per friend', () => {
    expect(directConversationStorageKey('me', 'bia')).toBe('lorkarium.dm.me.bia');
    expect(directIndexStorageKey('me')).toBe('lorkarium.dm.me');
  });

  it('friendIdOf is the other side, or null when the account is in neither', () => {
    expect(friendIdOf(dmSent(), ME_ID)).toBe(BIA.userId);
    expect(friendIdOf(dmSent({ fromUserId: ME_ID, toUserId: CAIO.userId }), ME_ID)).toBe(
      CAIO.userId,
    );
    expect(friendIdOf(dmSent({ toUserId: CAIO.userId }), ME_ID)).toBeNull();
  });

  it('a message of the friend on a closed conversation counts unread; on screen it does not', () => {
    const empty = emptyDirectConversation(BIA.userId);
    expect(withDirectMessage(empty, dmSent(), { open: false }).unread).toBe(1);
    expect(withDirectMessage(empty, dmSent(), { open: true }).unread).toBe(0);
  });

  it('a repeated message id returns the same conversation', () => {
    const event = dmSent();
    const once = withDirectMessage(emptyDirectConversation(BIA.userId), event, { open: false });
    expect(withDirectMessage(once, event, { open: false })).toBe(once);
  });
});
