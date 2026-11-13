import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { DIRECT_HISTORY_LIMIT, directConversationStorageKey } from '@/lib/direct-conversations';
import {
  createDirectMessagesStore,
  selectDirectUnreadCount,
  type DirectMessagesStore,
} from '@/stores/direct-messages-store';
import { DirectMessageCommandsFake } from '../support/direct-message-commands-fake';
import { BIA, CAIO, ME_ID, OTHER_ACCOUNT_ID, dmSent } from '../support/friends-fixtures';
import { InteractionClockFake } from '../support/interaction-clock-fake';
import { StorageFake } from '../support/storage-fake';

const AT = '2026-11-12T10:00:00.000Z';

describe('direct messages store', () => {
  let commands: DirectMessageCommandsFake;
  let storage: StorageFake;
  let clock: InteractionClockFake;
  let store: StoreApi<DirectMessagesStore>;

  function build(withStorage: StorageFake = storage): StoreApi<DirectMessagesStore> {
    return createDirectMessagesStore({ commands, storage: withStorage, clock });
  }

  beforeEach(() => {
    commands = new DirectMessageCommandsFake();
    storage = new StorageFake();
    clock = new InteractionClockFake();
    store = build();
    store.getState().signIn(ME_ID);
  });

  function messagesWith(friendId: string): readonly string[] {
    return (store.getState().conversations[friendId]?.messages ?? []).map(({ text }) => text);
  }

  it('a dm:sent from a friend goes into that friend conversation', () => {
    store.getState().apply({ kind: 'sent', event: dmSent({ text: 'oi' }) });
    expect(messagesWith(BIA.userId)).toEqual(['oi']);
  });

  it('a dm:sent of mine (another tab) goes into the conversation of whom it was to, not unread', () => {
    const mine = dmSent({ fromUserId: ME_ID, toUserId: CAIO.userId, text: 'e aí' });
    store.getState().apply({ kind: 'sent', event: mine });
    expect(messagesWith(CAIO.userId)).toEqual(['e aí']);
    expect(selectDirectUnreadCount(store.getState())).toBe(0);
  });

  it('a dm:sent the account is not part of is ignored', () => {
    const others = dmSent({ toUserId: CAIO.userId });
    store.getState().apply({ kind: 'sent', event: others });
    expect(store.getState().conversations).toEqual({});
  });

  it('the same message id arriving twice enters once', () => {
    const event = dmSent();
    store.getState().apply({ kind: 'sent', event });
    store.getState().apply({ kind: 'sent', event });
    expect(messagesWith(BIA.userId)).toHaveLength(1);
  });

  it('a closed conversation counts unread; opening it zeroes them', () => {
    store.getState().apply({ kind: 'sent', event: dmSent() });
    store.getState().apply({ kind: 'sent', event: dmSent() });
    expect(selectDirectUnreadCount(store.getState())).toBe(2);
    store.getState().setActive(BIA.userId);
    expect(selectDirectUnreadCount(store.getState())).toBe(0);
  });

  it('a message to the conversation on screen is read at once', () => {
    store.getState().setActive(BIA.userId);
    store.getState().apply({ kind: 'sent', event: dmSent() });
    expect(selectDirectUnreadCount(store.getState())).toBe(0);
  });

  it('dm:typingFrom shows "digitando" and it goes after 4 s without another', () => {
    store.getState().apply({ kind: 'typingFrom', event: { fromUserId: BIA.userId, at: AT } });
    expect(store.getState().typing).toEqual({ [BIA.userId]: true });
    clock.advance(3999);
    expect(store.getState().typing[BIA.userId]).toBe(true);
    clock.advance(1);
    expect(store.getState().typing).toEqual({});
  });

  it('a new dm:typingFrom restarts the 4 s', () => {
    store.getState().apply({ kind: 'typingFrom', event: { fromUserId: BIA.userId, at: AT } });
    clock.advance(3000);
    store.getState().apply({ kind: 'typingFrom', event: { fromUserId: BIA.userId, at: AT } });
    clock.advance(3000);
    expect(store.getState().typing[BIA.userId]).toBe(true);
  });

  it('the message of the friend turns their "digitando" off', () => {
    store.getState().apply({ kind: 'typingFrom', event: { fromUserId: BIA.userId, at: AT } });
    store.getState().apply({ kind: 'sent', event: dmSent() });
    expect(store.getState().typing).toEqual({});
    expect(clock.pending()).toEqual([]);
  });

  it(`the ${DIRECT_HISTORY_LIMIT + 1}th message drops the oldest`, () => {
    for (let index = 0; index <= DIRECT_HISTORY_LIMIT; index += 1) {
      store.getState().apply({ kind: 'sent', event: dmSent({ text: `m${index}` }) });
    }
    const texts = messagesWith(BIA.userId);
    expect(texts).toHaveLength(DIRECT_HISTORY_LIMIT);
    expect(texts[0]).toBe('m1');
  });

  it('the conversations survive a new store on the same device (an F5)', () => {
    store.getState().apply({ kind: 'sent', event: dmSent({ text: 'oi' }) });
    store = build();
    store.getState().signIn(ME_ID);
    expect(messagesWith(BIA.userId)).toEqual(['oi']);
    expect(selectDirectUnreadCount(store.getState())).toBe(1);
  });

  it('a storage that throws keeps the conversation in memory', () => {
    store = build(new StorageFake(true));
    store.getState().signIn(ME_ID);
    store.getState().apply({ kind: 'sent', event: dmSent({ text: 'oi' }) });
    expect(messagesWith(BIA.userId)).toEqual(['oi']);
  });

  it('a stored conversation outside its shape is left out', () => {
    store.getState().apply({ kind: 'sent', event: dmSent() });
    storage.setItem(directConversationStorageKey(ME_ID, BIA.userId), '{"messages":"x"}');
    store = build();
    store.getState().signIn(ME_ID);
    expect(store.getState().conversations).toEqual({});
  });

  it('another account on the same browser does not read the first one conversations', () => {
    store.getState().apply({ kind: 'sent', event: dmSent() });
    store.getState().signIn(OTHER_ACCOUNT_ID);
    expect(store.getState().conversations).toEqual({});
  });

  it('signing out deletes every conversation of the account from the device', () => {
    store.getState().apply({ kind: 'sent', event: dmSent() });
    store.getState().signOut();
    expect(store.getState()).toMatchObject({ accountId: null, conversations: {} });
    expect(storage.values.size).toBe(0);
  });

  it('forgetting a friend (a block) deletes that conversation and keeps the others', () => {
    store.getState().apply({ kind: 'sent', event: dmSent({ fromUserId: CAIO.userId }) });
    store.getState().apply({ kind: 'sent', event: dmSent() });
    store.getState().forget(BIA.userId);
    store = build();
    store.getState().signIn(ME_ID);
    expect(Object.keys(store.getState().conversations)).toEqual([CAIO.userId]);
  });

  it('send that goes answers ok and sends the text to the friend', async () => {
    expect(await store.getState().send(BIA.userId, 'oi')).toEqual({ ok: true });
    expect(commands.sent).toEqual([{ toUserId: BIA.userId, text: 'oi' }]);
  });

  it.each([['recipient_offline'], ['offline']] as const)(
    'send refused as %s gives the text back with the failure',
    async (kind) => {
      commands.answer = { ok: false, failure: { kind } };
      expect(await store.getState().send(BIA.userId, 'oi')).toEqual({
        ok: false,
        failure: { kind },
        text: 'oi',
      });
    },
  );

  it('notifyTyping tells the friend at most every 2 s', () => {
    store.getState().notifyTyping(BIA.userId);
    store.getState().notifyTyping(BIA.userId);
    clock.advance(2000);
    store.getState().notifyTyping(BIA.userId);
    expect(commands.typings).toEqual([BIA.userId, BIA.userId]);
  });
});
