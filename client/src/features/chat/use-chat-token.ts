import type { TokenDto } from '@lorkarium/contracts';
import { useCallback, useSyncExternalStore } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { SceneTabsStore } from '@/stores/scene-tabs-store';

/** Resolves a chat voice only inside the grids this viewer already has open.
 *
 * Example: `const token = useChatToken(tabs, speaker.sceneId, speaker.tokenId)` */
export function useChatToken(
  tabs: StoreApi<SceneTabsStore>,
  sceneId: string,
  tokenId: string,
): TokenDto | null {
  const subscribe = useCallback((notify: () => void) => followChatToken(tabs, notify), [tabs]);
  const snapshot = useCallback(() => chatTokenOf(tabs, sceneId, tokenId), [tabs, sceneId, tokenId]);
  return useSyncExternalStore(subscribe, snapshot);
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

function followChatToken(tabs: StoreApi<SceneTabsStore>, notify: () => void): () => void {
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
