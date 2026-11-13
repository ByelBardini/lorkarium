import { describe, expect, it } from 'vitest';
import { directConversationStorageKey, directIndexStorageKey } from '@/lib/direct-conversations';
import {
  readDirectConversations,
  removeAllDirectConversations,
  removeDirectConversation,
  writeDirectConversation,
} from '@/stores/direct-messages-storage';
import { BIA, CAIO, ME_ID, dmSent } from '../support/friends-fixtures';
import { StorageFake } from '../support/storage-fake';

describe('direct messages storage', () => {
  const biaTalk = { friendId: BIA.userId, messages: [dmSent()], unread: 1 };
  const caioTalk = { friendId: CAIO.userId, messages: [], unread: 0 };

  it('a written conversation reads back under the account', () => {
    const storage = new StorageFake();
    writeDirectConversation(storage, ME_ID, biaTalk, [BIA.userId]);
    expect(readDirectConversations(storage, ME_ID)).toEqual({ [BIA.userId]: biaTalk });
  });

  it('a broken index or none reads as no conversation', () => {
    const storage = new StorageFake();
    expect(readDirectConversations(storage, ME_ID)).toEqual({});
    storage.setItem(directIndexStorageKey(ME_ID), 'not json');
    expect(readDirectConversations(storage, ME_ID)).toEqual({});
  });

  it('removing one keeps the others in the index', () => {
    const storage = new StorageFake();
    writeDirectConversation(storage, ME_ID, biaTalk, [BIA.userId, CAIO.userId]);
    writeDirectConversation(storage, ME_ID, caioTalk, [BIA.userId, CAIO.userId]);
    removeDirectConversation(storage, ME_ID, BIA.userId, [CAIO.userId]);
    expect(readDirectConversations(storage, ME_ID)).toEqual({ [CAIO.userId]: caioTalk });
    expect(storage.getItem(directConversationStorageKey(ME_ID, BIA.userId))).toBeNull();
  });

  it('removing all also deletes the ones only the stored index names', () => {
    const storage = new StorageFake();
    writeDirectConversation(storage, ME_ID, biaTalk, [BIA.userId]);
    removeAllDirectConversations(storage, ME_ID, []);
    expect(storage.values.size).toBe(0);
  });

  it('a storage that throws neither reads nor breaks the writes', () => {
    const storage = new StorageFake(true);
    expect(() => writeDirectConversation(storage, ME_ID, biaTalk, [BIA.userId])).not.toThrow();
    expect(() => removeAllDirectConversations(storage, ME_ID, [BIA.userId])).not.toThrow();
    expect(readDirectConversations(storage, ME_ID)).toEqual({});
  });
});
