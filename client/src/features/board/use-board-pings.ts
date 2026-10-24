import type { SessionMemberDto } from '@lorkarium/contracts';
import { useCallback, useEffect } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { memberColorOf, type MemberColor } from '@lorkarium/game-core';
import { MEMBER_COLOR_HEX } from '@/lib/member-color';
import type { BoardRenderer, PingMark } from '@/renderer/board-renderer';
import type { BoardScope } from '@/services/board-command-sender';
import type { PingCommands, PingPoint } from '@/services/table-pings';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import type { PingFeed } from '@/stores/ping-feed';
import type { SessionStore } from '@/stores/session-store';
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
  /** The signed-in account: the color of the ping asked here. */
  session: StoreApi<SessionStore>;
}>;

/** The pings of the room: the others' (from the tab's feed) are drawn with their name and their
 *  color in the roster (the drawn one for someone outside it) and announced on the status line;
 *  the one asked here is drawn at once in the account's color and sent. A refused ping says
 *  nothing: it was only a pointer.
 *
 *  Example: `const ping = useBoardPings({ renderer, feed: tab.pings, presence, board, interaction, scopeOf, pings, session })` */
export function useBoardPings(deps: BoardPingsDeps): (point: PingPoint) => void {
  const { renderer, feed, presence, board, interaction, scopeOf, pings, session } = deps;
  useEffect(() => {
    if (!renderer || !feed) return;
    return feed.subscribe(({ userId, x, y }) => {
      const member = memberOf(presence, userId);
      const label = member?.name ?? PING_SOMEONE;
      renderer.showPing(pingMarkOf(label, memberColorOf(userId, member?.color ?? null), { x, y }));
      interaction.getState().say(pingAnnouncement(label, x, y));
    });
  }, [renderer, feed, presence, interaction]);
  return useCallback(
    (point: PingPoint) => {
      const viewerId = board?.getState().board?.viewer.userId;
      if (!renderer || !viewerId) return;
      const member = memberOf(presence, viewerId);
      const color = viewerColorOf(session, viewerId, member);
      renderer.showPing(pingMarkOf(member?.name ?? PING_SOMEONE, color, point));
      void pings.sendPing(scopeOf(), point);
    },
    [renderer, board, presence, pings, scopeOf, session],
  );
}

function memberOf(
  presence: StoreApi<TablePresenceStore> | null,
  userId: string,
): SessionMemberDto | undefined {
  return presence?.getState().members.find((candidate) => candidate.userId === userId);
}

// The account knows its own color first (a save on /account), before any event of the table.
function viewerColorOf(
  session: StoreApi<SessionStore>,
  viewerId: string,
  member: SessionMemberDto | undefined,
): MemberColor {
  const { session: state } = session.getState();
  if (state.status === 'authenticated' && state.user.id === viewerId) return state.user.color;
  return memberColorOf(viewerId, member?.color ?? null);
}

function pingMarkOf(label: string, color: MemberColor, { x, y }: PingPoint): PingMark {
  return { x, y, label, color: MEMBER_COLOR_HEX[color] };
}
