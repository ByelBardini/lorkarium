import type { TokenDto } from '@lorkarium/contracts';
import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { ChatMessage } from '@/lib/chat-conversations';
import type { SceneTabsStore } from '@/stores/scene-tabs-store';

/** What a line spoken as a token shows of it: the face beside the name. */
export type ChatTokenFace = Pick<TokenDto, 'initials' | 'imageAssetId' | 'frame'>;

/** A token voice of the feed: the grid and the token spoken as. */
export type ChatVoice = Readonly<{ sceneId: string; tokenId: string }>;

/** The faces of the feed by `chatVoiceKeyOf`; a voice of a grid not open here is absent. */
export type ChatTokenFaces = ReadonlyMap<string, ChatTokenFace>;

const NO_FACES: ChatTokenFaces = new Map();

/** The key of a voice in `ChatTokenFaces`.
 *
 *  Example: `faces.get(chatVoiceKeyOf(speaker.sceneId, speaker.tokenId))` */
export function chatVoiceKeyOf(sceneId: string, tokenId: string): string {
  return `${sceneId}:${tokenId}`;
}

/** The token voices of some messages, one per token spoken as however many lines it has.
 *
 *  Example: `useChatTokenFaces(tabs, useMemo(() => chatVoicesOf(messages), [messages]))` */
export function chatVoicesOf(messages: readonly ChatMessage[]): ChatVoice[] {
  const voices = new Map<string, ChatVoice>();
  for (const { event } of messages) {
    if (event.speaker.kind !== 'token') continue;
    const { sceneId, tokenId } = event.speaker;
    voices.set(chatVoiceKeyOf(sceneId, tokenId), { sceneId, tokenId });
  }
  return [...voices.values()];
}

/** The face of the token a message was spoken as; `null` spoken as oneself or not open here.
 *
 *  Example: `<ChatMessageRow face={chatFaceOf(faces, message)} … />` */
export function chatFaceOf(faces: ChatTokenFaces, { event }: ChatMessage): ChatTokenFace | null {
  if (event.speaker.kind !== 'token') return null;
  return faces.get(chatVoiceKeyOf(event.speaker.sceneId, event.speaker.tokenId)) ?? null;
}

/** The faces of the feed's token voices, resolved only inside the grids this viewer already has
 *  open, through one subscription for the whole feed (never one per line). The same map, and the
 *  same face per voice, while no face changed: a token that moves renders no line.
 *
 *  Example: `const faces = useChatTokenFaces(tabs, voicesOf(messages))` */
export function useChatTokenFaces(
  tabs: StoreApi<SceneTabsStore>,
  voices: readonly ChatVoice[],
): ChatTokenFaces {
  const shown = useRef<ChatTokenFaces>(NO_FACES);
  const subscribe = useCallback((notify: () => void) => followChatTokens(tabs, notify), [tabs]);
  const snapshot = useCallback((): ChatTokenFaces => {
    const now = facesOf(tabs, voices, shown.current);
    if (!sameFaces(shown.current, now)) shown.current = now;
    return shown.current;
  }, [tabs, voices]);
  return useSyncExternalStore(subscribe, snapshot);
}

function facesOf(
  tabs: StoreApi<SceneTabsStore>,
  voices: readonly ChatVoice[],
  before: ChatTokenFaces,
): ChatTokenFaces {
  const faces = new Map<string, ChatTokenFace>();
  for (const { sceneId, tokenId } of voices) {
    const key = chatVoiceKeyOf(sceneId, tokenId);
    const token = chatTokenOf(tabs, sceneId, tokenId);
    if (token) faces.set(key, keptFace(before.get(key), token));
  }
  return faces;
}

function keptFace(before: ChatTokenFace | undefined, token: TokenDto): ChatTokenFace {
  const { initials, imageAssetId, frame } = token;
  const same =
    before?.initials === initials && before.imageAssetId === imageAssetId && before.frame === frame;
  return same ? before : { initials, imageAssetId, frame };
}

function sameFaces(before: ChatTokenFaces, after: ChatTokenFaces): boolean {
  if (before.size !== after.size) return false;
  for (const [key, face] of after) if (before.get(key) !== face) return false;
  return true;
}

function chatTokenOf(
  tabs: StoreApi<SceneTabsStore>,
  sceneId: string,
  tokenId: string,
): TokenDto | null {
  for (const tab of tabs.getState().tabs) {
    const board = tab.board.getState().board;
    if (board?.scene.id === sceneId)
      return board.tokens.find((token) => token.id === tokenId) ?? null;
  }
  return null;
}

function followChatTokens(tabs: StoreApi<SceneTabsStore>, notify: () => void): () => void {
  let stopBoards = followBoards(tabs, notify);
  const stopTabs = tabs.subscribe(() => {
    stopBoards();
    stopBoards = followBoards(tabs, notify);
    notify();
  });
  return () => {
    stopTabs();
    stopBoards();
  };
}

function followBoards(tabs: StoreApi<SceneTabsStore>, notify: () => void): () => void {
  const stops = tabs.getState().tabs.map((tab) => tab.board.subscribe(notify));
  return () => stops.forEach((stop) => stop());
}
