import { useCallback, useEffect } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { pingColorOf } from '@/lib/ping-color';
import type { BoardRenderer, PingMark } from '@/renderer/board-renderer';
import type { BoardScope } from '@/services/board-command-sender';
import type { PingCommands, PingPoint } from '@/services/table-pings';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import type { PingFeed } from '@/stores/ping-feed';
import type { TablePresenceStore } from '@/stores/table-presence-store';
import { PING_SOMEONE, pingAnnouncement } from './board-messages';

export type BoardPingsDeps = Readonly<{
  renderer: BoardRenderer | null;
  /** The pings of the tab shown; `null` while the table has no tabs. */
  feed: PingFeed | null;
  presence: StoreApi<TablePresenceStore> | null;
  board: StoreApi<BoardStore> | null;
  interaction: StoreApi<BoardInteractionStore>;
  scopeOf: () => BoardScope;
  pings: PingCommands;
}>;

/** The pings of the room: the others' (from the tab's feed) are drawn with their name and color
 *  and announced on the status line; the one asked here is drawn at once and sent. A refused
 *  ping says nothing: it was only a pointer.
 *
 *  Example: `const ping = useBoardPings({ renderer, feed: tab.pings, presence, board, interaction, scopeOf, pings })` */
export function useBoardPings(deps: BoardPingsDeps): (point: PingPoint) => void {
  const { renderer, feed, presence, board, interaction, scopeOf, pings } = deps;
  useEffect(() => {
    if (!renderer || !feed) return;
    return feed.subscribe(({ userId, x, y }) => {
      const label = nameOf(presence, userId);
      renderer.showPing(pingMarkOf(userId, label, { x, y }));
      interaction.getState().say(pingAnnouncement(label, x, y));
    });
  }, [renderer, feed, presence, interaction]);
  return useCallback(
    (point: PingPoint) => {
      const viewerId = board?.getState().board?.viewer.userId;
      if (!renderer || !viewerId) return;
      renderer.showPing(pingMarkOf(viewerId, nameOf(presence, viewerId), point));
      void pings.sendPing(scopeOf(), point);
    },
    [renderer, board, presence, pings, scopeOf],
  );
}

function nameOf(presence: StoreApi<TablePresenceStore> | null, userId: string): string {
  const member = presence?.getState().members.find((candidate) => candidate.userId === userId);
  return member?.name ?? PING_SOMEONE;
}

function pingMarkOf(userId: string, label: string, { x, y }: PingPoint): PingMark {
  return { x, y, label, color: pingColorOf(userId) };
}
