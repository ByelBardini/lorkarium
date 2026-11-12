import { useEffect, useRef } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { ChatHistoryStore } from '@/stores/chat-history-store';
import type { OpenTable, OpenTablesStore } from '@/stores/open-tables-store';
import type { ChatAttention, FocusWindow } from './chat-attention-watch';

/** Reports to `attention` every message from someone else in the chat of any open table, wherever
 *  the person is in the app, and which tables are still open. Mounted once, by the shell; nothing
 *  without `attention` (the browser has no taskbar button to light).
 *
 *  Example: `useChatAttention(deps.openTables, deps.chatAttention, session.user.id)` */
export function useChatAttention(
  openTables: StoreApi<OpenTablesStore>,
  attention: ChatAttention | null,
  viewerId: string | null,
): void {
  const viewer = useRef(viewerId);
  useEffect(() => {
    viewer.current = viewerId;
  }, [viewerId]);
  useEffect(() => {
    if (attention === null) return;
    // By the chat store, not the id: a table closed and opened again comes with a new one.
    const listening = new Map<ChatStore, () => void>();
    const follow = (tables: readonly OpenTable[]): void => {
      for (const table of tables) {
        if (listening.has(table.chat)) continue;
        listening.set(
          table.chat,
          listenToTable(table, attention, () => viewer.current),
        );
      }
      forgetClosed(listening, tables);
      attention.keepOnly(new Set(tables.map((table) => table.campaignId)));
    };
    follow(openTables.getState().tables);
    const stopFollowing = openTables.subscribe((state) => follow(state.tables));
    return () => {
      stopFollowing();
      for (const stop of listening.values()) stop();
    };
  }, [openTables, attention]);
}

/** Tells `attention` this table's room is on screen while the hook is mounted, with the detached
 *  chat window (`null` while the chat is in the room).
 *
 *  Example: `useRoomAttention(deps.chatAttention, campaignId, chatWindow.focusWindow)` */
export function useRoomAttention(
  attention: ChatAttention | null,
  campaignId: string,
  chatWindow: FocusWindow | null,
): void {
  useEffect(() => attention?.showRoom(campaignId, chatWindow), [attention, campaignId, chatWindow]);
}

type ChatStore = StoreApi<ChatHistoryStore>;

function listenToTable(
  table: OpenTable,
  attention: ChatAttention,
  viewerIdOf: () => string | null,
): () => void {
  return table.chat.getState().onNewMessage((message) => {
    if (message.event.fromUserId === viewerIdOf()) return;
    attention.messageArrived(table.campaignId);
  });
}

function forgetClosed(listening: Map<ChatStore, () => void>, tables: readonly OpenTable[]): void {
  const open = new Set(tables.map((table) => table.chat));
  for (const [chat, stop] of listening) {
    if (open.has(chat)) continue;
    stop();
    listening.delete(chat);
  }
}
