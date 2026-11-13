import type { ChatSentDto } from '@lorkarium/contracts';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import {
  CHAT_SOUND_GAP_MS,
  useChatSound,
  type ChatSoundDeps,
} from '@/features/chat/use-chat-sound';
import type { ChatViewer } from '@/lib/chat-conversations';
import { createChatHistoryStore, type ChatHistoryStore } from '@/stores/chat-history-store';
import {
  createChatPreferencesStore,
  type ChatPreferencesStore,
} from '@/stores/chat-preferences-store';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { chatMessageIdOf, chatSent, directBetween } from '../../support/chat-fixtures';
import { ChatSoundsFake } from '../../support/chat-sound-fake';
import { InteractionClockFake } from '../../support/interaction-clock-fake';
import { StorageFake } from '../../support/storage-fake';
import { BIA_AT_TABLE, CAIO_AT_TABLE } from '../../support/table-session-fixtures';

const BIA = BIA_AT_TABLE.userId;
const CAIO = CAIO_AT_TABLE.userId;
const BIA_VIEWER: ChatViewer = { userId: BIA, names: ['Bia', 'bia'] };

function caioSays(n: number, text: string, overrides: Partial<ChatSentDto> = {}): ChatSentDto {
  return chatSent({ messageId: chatMessageIdOf(n), fromUserId: CAIO, text, ...overrides });
}

function anaWhispers(n: number, text = 'Tem uma armadilha ali'): ChatSentDto {
  const channel = { kind: 'table', whisperTo: BIA } as const;
  return chatSent({ messageId: chatMessageIdOf(n), fromUserId: ANA.id, channel, text });
}

describe('useChatSound', () => {
  let chat: StoreApi<ChatHistoryStore>;
  let chatPreferences: StoreApi<ChatPreferencesStore>;
  let clock: InteractionClockFake;
  let sounds: ChatSoundsFake;

  beforeEach(() => {
    chat = createChatHistoryStore({
      campaignId: VHARN.id,
      storage: new StorageFake(),
      viewer: () => BIA_VIEWER,
    });
    chatPreferences = createChatPreferencesStore(new StorageFake());
    clock = new InteractionClockFake();
    sounds = new ChatSoundsFake();
  });

  function mount(overrides: Partial<ChatSoundDeps> = {}) {
    const initial: ChatSoundDeps = {
      chat,
      clock,
      viewerId: BIA,
      chatPreferences,
      createChatSound: sounds.create,
      ...overrides,
    };
    return renderHook((props: ChatSoundDeps) => useChatSound(props), { initialProps: initial });
  }

  function receive(...events: ChatSentDto[]): void {
    act(() => {
      for (const event of events) chat.getState().apply({ kind: 'chatSent', event }, 1000);
    });
  }

  function plays(): number {
    return sounds.latest().plays;
  }

  it('a whisper to Bia with the drawer closed plays the sound once', () => {
    mount();

    receive(anaWhispers(1));

    expect(plays()).toBe(1);
  });

  it('Caio naming @Bia at the Table plays the sound', () => {
    mount();

    receive(caioSays(1, '@Bia, segura a porta'));

    expect(plays()).toBe(1);
  });

  it.each([
    ['a plain line at the Table', caioSays(1, 'Vou abrir a porta')],
    [
      'a direct message without a mention',
      caioSays(1, 'Oi', { channel: directBetween(BIA, CAIO) }),
    ],
    [
      'Bia’s own line naming herself',
      chatSent({ messageId: chatMessageIdOf(1), fromUserId: BIA, text: '@Bia aqui' }),
    ],
  ])('%s plays nothing', (_scenario, event) => {
    mount();

    receive(event);

    expect(plays()).toBe(0);
  });

  it('a whisper into the conversation on screen still plays', () => {
    mount();
    act(() => chat.getState().setActive('table'));

    receive(anaWhispers(1));

    expect(plays()).toBe(1);
  });

  it('with "Som do chat" off a whisper plays nothing and the sound is not even prepared', () => {
    chatPreferences.getState().setSound(false);
    mount();

    receive(anaWhispers(1));

    expect([plays(), sounds.latest().prepares]).toEqual([0, 0]);
  });

  it('two mentions 300 ms apart sound once; one a second after the first sounds again', () => {
    mount();

    receive(anaWhispers(1));
    act(() => clock.advance(300));
    receive(caioSays(2, '@Bia, corre'));
    expect(plays()).toBe(1);

    act(() => clock.advance(CHAT_SOUND_GAP_MS - 300));
    receive(anaWhispers(3));
    expect(plays()).toBe(2);
  });

  it('a mention while muted does not hold back the next one after unmuting', () => {
    mount();
    act(() => chatPreferences.getState().setSound(false));
    receive(anaWhispers(1));

    act(() => chatPreferences.getState().setSound(true));
    receive(anaWhispers(2));

    expect(plays()).toBe(1);
  });

  it('entering with the sound on prepares it; turning it back on prepares again', () => {
    mount();
    expect(sounds.latest().prepares).toBe(1);

    act(() => chatPreferences.getState().setSound(false));
    act(() => chatPreferences.getState().setSound(true));

    expect(sounds.latest().prepares).toBe(2);
  });

  it('unmounting destroys the sound and stops listening to the chat', () => {
    const { unmount } = mount();

    unmount();
    receive(anaWhispers(1));

    expect(sounds.latest().destroyed).toBe(true);
    expect(plays()).toBe(0);
  });

  it('without an open table no sound is made', () => {
    mount({ chat: null });

    expect(sounds.made).toEqual([]);
  });

  it('the viewer known later keeps the same sound and stops Bia’s own line from sounding', () => {
    const { rerender } = mount({ viewerId: null });

    rerender({ chat, clock, viewerId: BIA, chatPreferences, createChatSound: sounds.create });
    receive(chatSent({ messageId: chatMessageIdOf(1), fromUserId: BIA, text: '@Bia aqui' }));

    expect(sounds.made).toHaveLength(1);
    expect(plays()).toBe(0);
  });
});
