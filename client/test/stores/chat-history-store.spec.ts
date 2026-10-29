import { beforeEach, describe, expect, it } from 'vitest';
import type { ChatSentDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import {
  CHAT_HISTORY_LIMIT,
  chatHistoryStorageKey,
  createChatHistoryStore,
  type ChatHistoryStore,
  type ChatViewer,
} from '@/stores/chat-history-store';
import type { ChatConversation } from '@/lib/chat-conversations';
import { ANA } from '../support/auth-api-fake';
import { QUELM, VHARN } from '../support/campaigns-api-fake';
import {
  TRIO_GROUP_ID,
  chatMessageIdOf,
  chatSent,
  directBetween,
  trioGroup,
} from '../support/chat-fixtures';
import { StorageFake } from '../support/storage-fake';
import { BIA_AT_TABLE, CAIO_AT_TABLE, biaJoined } from '../support/table-session-fixtures';

const KEY = `lorkarium.chat.${VHARN.id}`;
const BIA = BIA_AT_TABLE.userId;
const CAIO = CAIO_AT_TABLE.userId;
const ANA_VIEWER: ChatViewer = { userId: ANA.id, names: ['Ana', 'ana'] };

describe('chat history store', () => {
  let storage: StorageFake;
  let viewer: ChatViewer | null;
  let store: StoreApi<ChatHistoryStore>;

  function storeOver(over: StorageFake): StoreApi<ChatHistoryStore> {
    return createChatHistoryStore({ campaignId: VHARN.id, storage: over, viewer: () => viewer });
  }

  beforeEach(() => {
    storage = new StorageFake();
    viewer = ANA_VIEWER;
    store = storeOver(storage);
  });

  function receive(event: ChatSentDto, atMs = 1000): void {
    store.getState().apply({ kind: 'chatSent', event }, atMs);
  }

  function conversation(key: string): ChatConversation | undefined {
    return store.getState().conversations.find((each) => each.key === key);
  }

  function textsOf(key: string): string[] {
    return conversation(key)?.messages.map((message) => message.event.text) ?? [];
  }

  describe('closing a conversation locally', () => {
    it('closing the active direct preserves its history, clears unread, returns to Table and persists the hidden state', () => {
      receive(chatSent({ channel: directBetween(ANA.id, BIA) }));
      store.getState().setActive(`direct:${BIA}`);
      store.getState().closeConversation(`direct:${BIA}`);
      expect(store.getState().activeKey).toBe('table');
      expect(conversation(`direct:${BIA}`)).toMatchObject({ closed: true, unread: 0 });
      expect(textsOf(`direct:${BIA}`)).toEqual(['Oi, mesa.']);
      expect(
        storeOver(storage)
          .getState()
          .conversations.find((each) => each.key === `direct:${BIA}`),
      ).toMatchObject({ closed: true, unread: 0 });
    });

    it('closing a group leaves another conversation active and a new message opens the group again', () => {
      receive(chatSent({ channel: trioGroup(), text: 'antes' }));
      store.getState().setActive('table');
      store.getState().closeConversation(`group:${TRIO_GROUP_ID}`);
      expect(conversation(`group:${TRIO_GROUP_ID}`)?.closed).toBe(true);
      expect(store.getState().activeKey).toBe('table');
      receive(chatSent({ channel: trioGroup(), messageId: chatMessageIdOf(2), text: 'depois' }));
      expect(textsOf(`group:${TRIO_GROUP_ID}`)).toEqual(['antes', 'depois']);
      expect(conversation(`group:${TRIO_GROUP_ID}`)?.closed).toBe(false);
      expect(conversation(`group:${TRIO_GROUP_ID}`)?.unread).toBe(1);
    });

    it('starting a closed private reopens the conversation with the preserved history', () => {
      receive(chatSent({ channel: directBetween(ANA.id, BIA), text: 'guardada' }));
      store.getState().closeConversation(`direct:${BIA}`);
      store.getState().startConversation({ kind: 'direct', userId: BIA });
      expect(conversation(`direct:${BIA}`)?.closed).toBe(false);
      expect(textsOf(`direct:${BIA}`)).toEqual(['guardada']);
    });

    it('Table cannot be closed and closing an absent conversation leaves hidden chat inactive', () => {
      receive(chatSent());
      store.getState().closeConversation('table');
      store.getState().closeConversation(`direct:${BIA}`);
      expect(textsOf('table')).toEqual(['Oi, mesa.']);
      expect(store.getState().activeKey).toBeNull();
    });
  });

  describe('where a message goes', () => {
    it('a fresh store has only the empty Table conversation, none active', () => {
      expect(store.getState().conversations).toEqual([
        { key: 'table', target: { kind: 'table' }, messages: [], unread: 0, mentioned: false },
      ]);
      expect(store.getState().activeKey).toBeNull();
    });

    it('a Table message enters the Table conversation, received at the given time', () => {
      receive(chatSent(), 1500);

      expect(conversation('table')?.messages).toEqual([{ event: chatSent(), receivedAtMs: 1500 }]);
    });

    it('a whisper stays in the Table conversation', () => {
      receive(chatSent({ channel: { kind: 'table', whisperTo: ANA.id }, text: 'psiu' }));

      expect(textsOf('table')).toEqual(['psiu']);
    });

    it('a direct of Bia to Ana enters direct:<Bia>, the other person of the pair', () => {
      receive(chatSent({ channel: directBetween(ANA.id, BIA), text: 'só pra você' }));

      expect(conversation(`direct:${BIA}`)?.target).toEqual({ kind: 'direct', userId: BIA });
      expect(textsOf(`direct:${BIA}`)).toEqual(['só pra você']);
    });

    it('a direct Ana sent to Caio enters direct:<Caio>', () => {
      receive(chatSent({ fromUserId: ANA.id, channel: directBetween(ANA.id, CAIO), text: 'e aí' }));

      expect(textsOf(`direct:${CAIO}`)).toEqual(['e aí']);
    });

    it('a direct read by the second of the pair (Bia) enters direct:<the first> (Ana)', () => {
      viewer = { userId: BIA, names: ['Bia'] };
      receive(chatSent({ fromUserId: ANA.id, channel: directBetween(ANA.id, BIA), text: 'oi' }));

      expect(textsOf(`direct:${ANA.id}`)).toEqual(['oi']);
    });

    it('a direct whose pair does not include the viewer is dropped', () => {
      receive(chatSent({ channel: directBetween(BIA, CAIO) }));

      expect(store.getState().conversations.map((each) => each.key)).toEqual(['table']);
    });

    it('a direct while the viewer is unknown is dropped', () => {
      viewer = null;
      receive(chatSent({ channel: directBetween(ANA.id, BIA) }));

      expect(store.getState().conversations.map((each) => each.key)).toEqual(['table']);
    });

    it('the first message of a group creates group:<id> with its name and members', () => {
      receive(chatSent({ channel: trioGroup(), text: 'plano?' }));

      expect(conversation(`group:${TRIO_GROUP_ID}`)?.target).toEqual({
        kind: 'group',
        groupId: TRIO_GROUP_ID,
        name: 'Os Três',
        memberIds: [ANA.id, BIA, CAIO],
      });
      expect(textsOf(`group:${TRIO_GROUP_ID}`)).toEqual(['plano?']);
    });

    it('a known group with the same members in another order takes the message', () => {
      receive(chatSent({ channel: trioGroup() }));
      receive(
        chatSent({
          messageId: chatMessageIdOf(2),
          channel: trioGroup([CAIO, ANA.id, BIA]),
          text: 'segunda',
        }),
      );

      expect(textsOf(`group:${TRIO_GROUP_ID}`)).toEqual(['Oi, mesa.', 'segunda']);
    });

    it('a known group arriving with other members is dropped', () => {
      receive(chatSent({ channel: trioGroup() }));
      receive(
        chatSent({
          messageId: chatMessageIdOf(2),
          channel: trioGroup([ANA.id, BIA]),
          text: 'forjada',
        }),
      );

      expect(textsOf(`group:${TRIO_GROUP_ID}`)).toEqual(['Oi, mesa.']);
    });

    it('the same messageId twice keeps one message, the first', () => {
      receive(chatSent(), 1000);
      receive(chatSent({ text: 'de novo' }), 2000);

      expect(conversation('table')?.messages.map((message) => message.receivedAtMs)).toEqual([
        1000,
      ]);
    });

    it(`the ${CHAT_HISTORY_LIMIT + 1}st message of a conversation takes its oldest out, and no other conversation's`, () => {
      receive(chatSent({ messageId: chatMessageIdOf(9000), channel: directBetween(ANA.id, BIA) }));
      for (let n = 0; n <= CHAT_HISTORY_LIMIT; n += 1) {
        receive(chatSent({ messageId: chatMessageIdOf(n), text: `m${n}` }), n);
      }

      const texts = textsOf('table');
      expect(texts).toHaveLength(300);
      expect(texts[0]).toBe('m1');
      expect(texts.at(-1)).toBe('m300');
      expect(textsOf(`direct:${BIA}`)).toHaveLength(1);
    });

    it('an update that is not a message, or a message of another table, changes nothing', () => {
      store.getState().apply({ kind: 'memberJoined', event: biaJoined() }, 1000);
      receive(chatSent({ campaignId: QUELM.id }));

      expect(textsOf('table')).toEqual([]);
      expect(storage.values.has(KEY)).toBe(false);
    });
  });

  describe('unread and mention', () => {
    it('a message of someone else outside the active conversation counts as unread', () => {
      receive(chatSent());
      receive(chatSent({ messageId: chatMessageIdOf(2) }));

      expect(conversation('table')?.unread).toBe(2);
      expect(conversation('table')?.mentioned).toBe(false);
    });

    it('a message of the viewer never counts as unread', () => {
      receive(chatSent({ fromUserId: ANA.id }));

      expect(conversation('table')?.unread).toBe(0);
    });

    it('a message in the active conversation does not count as unread', () => {
      store.getState().setActive('table');
      receive(chatSent());

      expect(conversation('table')?.unread).toBe(0);
    });

    it('@Ana outside the active conversation marks it mentioned', () => {
      receive(chatSent({ text: '@Ana rola a iniciativa' }));

      expect(conversation('table')).toMatchObject({ unread: 1, mentioned: true });
    });

    it('a whisper to the viewer marks the Table mentioned', () => {
      receive(chatSent({ channel: { kind: 'table', whisperTo: ANA.id } }));

      expect(conversation('table')?.mentioned).toBe(true);
    });

    it('markRead zeroes the unread and the mention of that conversation only', () => {
      receive(chatSent({ text: '@Ana' }));
      receive(chatSent({ messageId: chatMessageIdOf(2), channel: directBetween(ANA.id, BIA) }));

      store.getState().markRead('table');

      expect(conversation('table')).toMatchObject({ unread: 0, mentioned: false });
      expect(conversation(`direct:${BIA}`)?.unread).toBe(1);
    });

    it('opening a conversation (setActive) reads it; closing the panel (null) lets unread rise again', () => {
      receive(chatSent());
      store.getState().setActive('table');
      store.getState().setActive(null);
      receive(chatSent({ messageId: chatMessageIdOf(2) }));

      expect(conversation('table')?.unread).toBe(1);
    });
  });

  describe('starting a conversation', () => {
    it('a direct started with Caio exists empty, and starting it again keeps one', () => {
      const key = store.getState().startConversation({ kind: 'direct', userId: CAIO });
      store.getState().startConversation({ kind: 'direct', userId: CAIO });

      expect(key).toBe(`direct:${CAIO}`);
      expect(store.getState().conversations.map((each) => each.key)).toEqual([
        'table',
        `direct:${CAIO}`,
      ]);
      expect(textsOf(key)).toEqual([]);
    });

    it('a group started here takes the first message that arrives for it', () => {
      const memberIds = [ANA.id, BIA, CAIO];
      const group = { kind: 'group', groupId: TRIO_GROUP_ID, name: 'Os Três', memberIds } as const;
      store.getState().startConversation(group);
      receive(chatSent({ fromUserId: ANA.id, channel: trioGroup(), text: 'criei' }));

      expect(textsOf(`group:${TRIO_GROUP_ID}`)).toEqual(['criei']);
    });
  });

  describe('storage', () => {
    it('stores under lorkarium.chat.<campaignId>, and a new store (an F5) reads it back', () => {
      receive(chatSent({ text: '@Ana' }), 1000);
      receive(chatSent({ messageId: chatMessageIdOf(2), channel: trioGroup() }), 2000);

      expect(chatHistoryStorageKey(VHARN.id)).toBe(KEY);
      const reread = storeOver(storage).getState().conversations;
      expect(reread).toEqual(store.getState().conversations);
      expect(reread.find((each) => each.key === 'table')).toMatchObject({
        unread: 1,
        mentioned: true,
      });
    });

    it.each([
      ['not JSON', '{oops'],
      ['the wrong shape', JSON.stringify({ conversations: [{ key: 'table' }] })],
    ])('a stored value that is %s reads as the empty Table', (_, raw) => {
      storage.values.set(KEY, raw);

      expect(storeOver(storage).getState().conversations).toEqual([
        { key: 'table', target: { kind: 'table' }, messages: [], unread: 0, mentioned: false },
      ]);
    });

    it('a storage that throws keeps the conversations in memory', () => {
      const broken = storeOver(new StorageFake(true));

      broken.getState().apply({ kind: 'chatSent', event: chatSent() }, 1000);

      expect(broken.getState().conversations[0]?.messages).toHaveLength(1);
    });

    it('clear() empties every conversation and forgets the storage key', () => {
      receive(chatSent());
      receive(chatSent({ messageId: chatMessageIdOf(2), channel: directBetween(ANA.id, BIA) }));
      store.getState().setActive('table');

      store.getState().clear();

      expect(store.getState().conversations.map((each) => each.key)).toEqual(['table']);
      expect(textsOf('table')).toEqual([]);
      expect(store.getState().activeKey).toBeNull();
      expect(storage.values.has(KEY)).toBe(false);
    });
  });

  describe('onNewMessage', () => {
    it('hears each new message with its conversation key, never a repeated one', () => {
      const heard: string[] = [];
      store.getState().onNewMessage((message, key) => heard.push(`${key} ${message.event.text}`));

      receive(chatSent());
      receive(chatSent());
      receive(chatSent({ messageId: chatMessageIdOf(2), channel: directBetween(ANA.id, BIA) }));

      expect(heard).toEqual(['table Oi, mesa.', `direct:${BIA} Oi, mesa.`]);
    });

    it('stops hearing after unsubscribing', () => {
      const heard: string[] = [];
      const stop = store.getState().onNewMessage((message) => heard.push(message.event.text));

      stop();
      receive(chatSent());

      expect(heard).toEqual([]);
    });
  });
});
