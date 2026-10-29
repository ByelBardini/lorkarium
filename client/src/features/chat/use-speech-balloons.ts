import { useEffect, useRef } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { ChatMessage } from '@/lib/chat-conversations';
import type { BoardRenderer, SpeechBalloon } from '@/renderer/board-renderer';
import { speechExpired } from '@/renderer/speech-balloon';
import type { ChatHistoryStore } from '@/stores/chat-history-store';

export type SpeechBalloonsDeps = Readonly<{
  /** The board on screen; `null` until it mounts (the lines wait for it). */
  renderer: BoardRenderer | null;
  /** The table's chat; `null` until the table opens. */
  chat: StoreApi<ChatHistoryStore> | null;
  /** The grid shown, asked at each hand-over (the renderer draws only that grid's lines). */
  sceneIdOf: () => string;
  /** The wall clock the chat stamps `receivedAtMs` with (`Date.now` by default). */
  now?: () => number;
}>;

/** Hands the board the lines said as a character to the whole Table (never a whisper, a direct
 *  or a group), each from when this client got it (`shownAt = receivedAtMs`). Every hand-over
 *  is the whole list of lines still alive; a new renderer (another grid tab) gets it at once.
 *
 *  Example: `useSpeechBalloons({ renderer, chat: table?.chat ?? null, sceneIdOf: () => scopeOf().sceneId })` */
export function useSpeechBalloons(deps: SpeechBalloonsDeps): void {
  const { renderer, chat, sceneIdOf } = deps;
  const now = deps.now ?? Date.now;
  const alive = useRef<readonly SpeechBalloon[]>([]);
  useEffect(() => {
    if (!renderer || alive.current.length === 0) return;
    alive.current = alive.current.filter((each) => !speechExpired(each, now()));
    renderer.showSpeech(sceneIdOf(), alive.current);
  }, [renderer, sceneIdOf, now]);
  useEffect(() => {
    if (!chat) return;
    return chat.getState().onNewMessage((message) => {
      const balloon = balloonOf(message);
      if (!balloon) return;
      const kept = alive.current.filter((each) => !speechExpired(each, now()));
      alive.current = [...kept, balloon];
      renderer?.showSpeech(sceneIdOf(), alive.current);
    });
  }, [chat, renderer, sceneIdOf, now]);
}

function balloonOf({ event, receivedAtMs }: ChatMessage): SpeechBalloon | null {
  const { channel, speaker } = event;
  if (speaker.kind !== 'token') return null;
  if (channel.kind !== 'table' || channel.whisperTo !== null) return null;
  return {
    id: event.messageId,
    sceneId: speaker.sceneId,
    tokenId: speaker.tokenId,
    speakerName: speaker.name,
    text: event.text,
    shownAt: receivedAtMs,
  };
}
