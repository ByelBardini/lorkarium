import { useEffect, useRef } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { ChatSound, ChatSoundFactory } from '@/chat-audio/chat-sound';
import { chatNoticeOf } from '@/lib/chat-notices';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { ChatHistoryStore, ChatMessageListener } from '@/stores/chat-history-store';
import type { ChatPreferencesStore } from '@/stores/chat-preferences-store';

/** At least this long between two sounds: a burst of mentions rings once, not a peal. */
export const CHAT_SOUND_GAP_MS = 1000;

export type ChatSoundDeps = Readonly<{
  /** The table's chat; `null` until the table opens. */
  chat: StoreApi<ChatHistoryStore> | null;
  /** Measures the gap between two sounds. */
  clock: InteractionClock;
  /** The signed-in account (its own messages ring nothing); `null` while unknown. */
  viewerId: string | null;
  /** "Som do chat" on this device. */
  chatPreferences: StoreApi<ChatPreferencesStore>;
  createChatSound: ChatSoundFactory;
}>;

type Listening = Readonly<{
  chat: StoreApi<ChatHistoryStore>;
  clock: InteractionClock;
  viewerIdOf: () => string | null;
  preferences: StoreApi<ChatPreferencesStore>;
  sound: ChatSound;
}>;

/** Rings a short sound for each new important message of the table's chat (a mention or a
 *  whisper to the viewer, `chatNoticeOf`), never for the viewer's own nor for the conversation on
 *  screen, at most once per `CHAT_SOUND_GAP_MS`. Prepared on entering (or on unmuting); muted
 *  while "Som do chat" is off; destroyed when the table closes or the hook unmounts.
 *
 *  Example: `useChatSound({ chat, clock: browserClock, viewerId, chatPreferences, createChatSound })` */
export function useChatSound(deps: ChatSoundDeps): void {
  const { chat, clock, viewerId, chatPreferences, createChatSound } = deps;
  const viewer = useRef(viewerId);
  useEffect(() => {
    viewer.current = viewerId;
  }, [viewerId]);
  useEffect(() => {
    if (chat === null) return;
    const sound = createChatSound();
    return listenFor({
      chat,
      clock,
      viewerIdOf: () => viewer.current,
      preferences: chatPreferences,
      sound,
    });
  }, [chat, clock, chatPreferences, createChatSound]);
}

function listenFor(listening: Listening): () => void {
  const { chat, preferences, sound } = listening;
  if (preferences.getState().sound) sound.prepare();
  const ring = ringer(listening);
  const stopHearing = chat.getState().onNewMessage(ring);
  const stopWatching = preferences.subscribe((state, previous) => {
    if (!previous.sound && state.sound) sound.prepare();
  });
  return () => {
    stopHearing();
    stopWatching();
    sound.destroy();
  };
}

function ringer(listening: Listening): ChatMessageListener {
  const { chat, clock, viewerIdOf, preferences, sound } = listening;
  let lastRungAt = Number.NEGATIVE_INFINITY;
  return (message, key, calls) => {
    if (!preferences.getState().sound) return;
    const shownKey = chat.getState().activeKey;
    const notice = chatNoticeOf({ message, key, calls, viewerId: viewerIdOf(), shownKey });
    if (!notice.important || clock.now() - lastRungAt < CHAT_SOUND_GAP_MS) return;
    lastRungAt = clock.now();
    sound.play();
  };
}
