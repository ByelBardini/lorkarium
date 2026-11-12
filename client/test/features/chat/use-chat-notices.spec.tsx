import type { ChatSentDto } from '@lorkarium/contracts';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import {
  CHAT_NOTICE_LIMIT,
  CHAT_PREVIEW_MS,
  useChatNotices,
  type ChatNoticeItem,
  type ChatNoticesDeps,
} from '@/features/chat/use-chat-notices';
import type { ChatViewer } from '@/lib/chat-conversations';
import { createChatHistoryStore, type ChatHistoryStore } from '@/stores/chat-history-store';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { chatMessageIdOf, chatSent, directBetween } from '../../support/chat-fixtures';
import { InteractionClockFake } from '../../support/interaction-clock-fake';
import { StorageFake } from '../../support/storage-fake';
import { BIA_AT_TABLE, CAIO_AT_TABLE } from '../../support/table-session-fixtures';

const BIA = BIA_AT_TABLE.userId;
const CAIO = CAIO_AT_TABLE.userId;
const BIA_VIEWER: ChatViewer = { userId: BIA, names: ['Bia', 'bia'] };

function caioSays(n: number, text: string, overrides: Partial<ChatSentDto> = {}): ChatSentDto {
  return chatSent({ messageId: chatMessageIdOf(n), fromUserId: CAIO, text, ...overrides });
}

function anaWhispers(n: number, text: string): ChatSentDto {
  const channel = { kind: 'table', whisperTo: BIA } as const;
  return chatSent({ messageId: chatMessageIdOf(n), fromUserId: ANA.id, channel, text });
}

function caioDirect(n: number, text: string): ChatSentDto {
  return caioSays(n, text, { channel: directBetween(BIA, CAIO) });
}

function textsOf(items: readonly ChatNoticeItem[]): string[] {
  return items.map((item) => item.message.event.text);
}

describe('useChatNotices', () => {
  let storage: StorageFake;
  let chat: StoreApi<ChatHistoryStore>;
  let clock: InteractionClockFake;

  beforeEach(() => {
    storage = new StorageFake();
    chat = chatOver(storage);
    clock = new InteractionClockFake();
  });

  function chatOver(over: StorageFake): StoreApi<ChatHistoryStore> {
    return createChatHistoryStore({
      campaignId: VHARN.id,
      storage: over,
      viewer: () => BIA_VIEWER,
    });
  }

  function mount(overrides: Partial<ChatNoticesDeps> = {}) {
    const initial: ChatNoticesDeps = { chat, clock, viewerId: BIA, ...overrides };
    return renderHook((props: ChatNoticesDeps) => useChatNotices(props), {
      initialProps: initial,
    });
  }

  function receive(...events: ChatSentDto[]): void {
    act(() => {
      for (const event of events) chat.getState().apply({ kind: 'chatSent', event }, 1000);
    });
  }

  function advance(ms: number): void {
    act(() => clock.advance(ms));
  }

  it('a line of Caio at the Table becomes a preview carrying its message, key and id', () => {
    const { result } = mount();
    receive(caioSays(1, 'Vou abrir a porta'));
    expect(result.current.previews).toEqual([
      {
        id: chatMessageIdOf(1),
        key: 'table',
        message: { event: caioSays(1, 'Vou abrir a porta'), receivedAtMs: 1000 },
      },
    ]);
    expect(result.current.importants).toEqual([]);
  });

  it('three messages are three previews, and the fourth takes out the oldest', () => {
    const { result } = mount();
    receive(caioSays(1, 'um'), caioSays(2, 'dois'), caioSays(3, 'três'));
    expect(textsOf(result.current.previews)).toEqual(['um', 'dois', 'três']);
    receive(caioSays(4, 'quatro'));
    expect(textsOf(result.current.previews)).toEqual(['dois', 'três', 'quatro']);
    expect(CHAT_NOTICE_LIMIT).toBe(3);
  });

  it('the preview pushed out no longer waits on the clock', () => {
    mount();
    receive(caioSays(1, 'um'), caioSays(2, 'dois'), caioSays(3, 'três'), caioSays(4, 'quatro'));
    expect(clock.pending()).toEqual([7000, 7000, 7000]);
  });

  it('a preview lives 7 s and then leaves', () => {
    const { result } = mount();
    receive(caioSays(1, 'Vou abrir'));
    advance(CHAT_PREVIEW_MS - 1);
    expect(textsOf(result.current.previews)).toEqual(['Vou abrir']);
    advance(1);
    expect(result.current.previews).toEqual([]);
    expect(CHAT_PREVIEW_MS).toBe(7000);
  });

  it('each preview counts its own 7 s from when it arrived', () => {
    const { result } = mount();
    receive(caioSays(1, 'um'));
    advance(3000);
    receive(caioSays(2, 'dois'));
    advance(4000);
    expect(textsOf(result.current.previews)).toEqual(['dois']);
  });

  it('a whisper to the viewer is also an important notice that does not leave with time', () => {
    const { result } = mount();
    receive(anaWhispers(1, 'Só você vê a marca'));
    expect(textsOf(result.current.previews)).toEqual(['Só você vê a marca']);
    advance(30_000);
    expect(result.current.previews).toEqual([]);
    expect(result.current.importants).toEqual([
      {
        id: chatMessageIdOf(1),
        key: 'table',
        message: { event: anaWhispers(1, 'Só você vê a marca'), receivedAtMs: 1000 },
      },
    ]);
  });

  it('an @ of the viewer in a direct is an important notice of that direct', () => {
    const { result } = mount();
    receive(caioDirect(1, '@Bia cura?'));
    expect(result.current.importants.map((item) => item.key)).toEqual([`direct:${CAIO}`]);
  });

  it.each([
    ['a direct without a mention', caioDirect(1, 'só nós')],
    ['an @ of a longer name', caioSays(1, '@Biatriz vem')],
  ])('%s is only a preview', (_case, event) => {
    const { result } = mount();
    receive(event);
    expect(result.current.previews).toHaveLength(1);
    expect(result.current.importants).toEqual([]);
  });

  it.each([
    ['set active', (store: ChatHistoryStore) => store.setActive('table')],
    ['marked read', (store: ChatHistoryStore) => store.markRead('table')],
    ['cleared', (store: ChatHistoryStore) => store.clear()],
  ])('the conversation of the important notice %s takes it out', (_case, read) => {
    const { result } = mount();
    receive(anaWhispers(1, 'psiu'));
    act(() => read(chat.getState()));
    expect(result.current.importants).toEqual([]);
    expect(result.current.previews).toEqual([]);
  });

  it('a direct closed here takes its important notice out', () => {
    const { result } = mount();
    receive(caioDirect(1, '@Bia cura?'));
    act(() => chat.getState().closeConversation(`direct:${CAIO}`));
    expect(result.current.importants).toEqual([]);
  });

  it('reading another conversation keeps the important notice and the preview', () => {
    const { result } = mount();
    receive(caioDirect(1, '@Bia cura?'));
    act(() => chat.getState().setActive('table'));
    expect(textsOf(result.current.importants)).toEqual(['@Bia cura?']);
    expect(textsOf(result.current.previews)).toEqual(['@Bia cura?']);
  });

  it('three important notices stay, and the fourth takes out the oldest', () => {
    const { result } = mount();
    receive(anaWhispers(1, 'um'), anaWhispers(2, 'dois'), anaWhispers(3, 'três'));
    receive(anaWhispers(4, 'quatro'));
    expect(textsOf(result.current.importants)).toEqual(['dois', 'três', 'quatro']);
  });

  it('the viewer’s own message sets off nothing', () => {
    const { result } = mount();
    receive(chatSent({ fromUserId: BIA, text: '@Bia lembrete' }));
    expect(result.current).toMatchObject({ previews: [], importants: [] });
    expect(clock.pending()).toEqual([]);
  });

  it('a message of the conversation shown (drawer or detached window) sets off nothing', () => {
    act(() => chat.getState().setActive('table'));
    const { result } = mount();
    receive(anaWhispers(1, 'psiu'), caioSays(2, 'Vou abrir'));
    expect(result.current).toMatchObject({ previews: [], importants: [] });
  });

  it('after an F5 the messages read back from the storage set off nothing', () => {
    receive(anaWhispers(1, 'psiu'), caioSays(2, 'Vou abrir'));
    chat = chatOver(storage);
    const { result } = mount();
    expect(chat.getState().conversations[0]?.mentioned).toBe(true);
    expect(result.current).toMatchObject({ previews: [], importants: [] });
  });

  it('dismissing a notice takes it out of both lists and stops its clock', () => {
    const { result } = mount();
    receive(anaWhispers(1, 'psiu'), caioSays(2, 'Vou abrir'));
    act(() => result.current.dismiss(chatMessageIdOf(1)));
    expect(textsOf(result.current.previews)).toEqual(['Vou abrir']);
    expect(result.current.importants).toEqual([]);
    expect(clock.pending()).toEqual([7000]);
  });

  it('unmounting stops every clock it started', () => {
    const { unmount } = mount();
    receive(caioSays(1, 'um'), caioSays(2, 'dois'));
    unmount();
    expect(clock.pending()).toEqual([]);
  });

  it('a viewer known only later keeps the notices and their clocks', () => {
    const { result, rerender } = mount({ viewerId: null });
    receive(caioSays(1, 'Vou abrir'));
    rerender({ chat, clock, viewerId: BIA });
    receive(chatSent({ messageId: chatMessageIdOf(2), fromUserId: BIA }));
    expect(textsOf(result.current.previews)).toEqual(['Vou abrir']);
    expect(clock.pending()).toEqual([7000]);
  });

  it('another table’s chat starts with no notice', () => {
    const { result, rerender } = mount();
    receive(caioSays(1, 'Vou abrir'));
    rerender({ chat: chatOver(new StorageFake()), clock, viewerId: BIA });
    expect(result.current).toMatchObject({ previews: [], importants: [] });
    expect(clock.pending()).toEqual([]);
  });

  it('no table open: no notice', () => {
    const { result } = mount({ chat: null });
    expect(result.current).toMatchObject({ previews: [], importants: [] });
  });
});
