import type { CampaignRoleDto, SessionMemberDto } from '@lorkarium/contracts';
import { useEffect } from 'react';
import { useRevalidator } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { toolsOf } from '@/lib/table-role';
import type { BoardStore } from '@/stores/board-store';
import { visibleTabOf, type SceneTabsStore } from '@/stores/scene-tabs-store';
import { useSession, type SessionStore } from '@/stores/session-store';
import type { TablePresenceStore } from '@/stores/table-presence-store';
import { roleChangedNotice } from './board-messages';

/** The stores of an open table that follow the viewer's own role. */
export type ViewerRoleTable = Readonly<{
  presence: StoreApi<TablePresenceStore>;
  tabs: StoreApi<SceneTabsStore>;
  cast: StoreApi<BoardStore>;
}>;

export type ViewerRoleDeps = ViewerRoleTable &
  Readonly<{
    /** The signed-in account: whose role is followed. */
    viewerId: string;
    /** Reads the campaign again (its `myRole` drives the room's tools and badge). */
    revalidate: () => void;
  }>;

/** Follows the viewer's own role in the roster: when someone promotes or demotes them with the
 *  table open (a `session:memberUpdated` with another role), every open grid and the cast ask
 *  their snapshot again (the server redacts them for the new role), the campaign is read again,
 *  a tool the new role does not have (`toolsOf`) drops back to Selecionar and the status line
 *  says what changed. A new profile, juggernaut switched on the same role or another member's
 *  change does nothing. Returns the unsubscribe.
 *
 *  Example: `const stop = followViewerRole({ presence, tabs, cast, viewerId, revalidate })` */
export function followViewerRole(deps: ViewerRoleDeps): () => void {
  return deps.presence.subscribe((next, previous) => {
    const role = roleOf(next.members, deps.viewerId);
    const was = roleOf(previous.members, deps.viewerId);
    if (!role || !was || role === was) return;
    onRoleChanged(deps, role);
  });
}

/** `followViewerRole` for the room, while the table is open: the viewer is the signed-in account
 *  and the campaign is read again through the router's revalidation.
 *
 *  Example: `useViewerRole(opened.kind === 'open' && opened.tabs ? { ...opened, tabs: opened.tabs } : null, sessionStore)` */
export function useViewerRole(
  table: ViewerRoleTable | null,
  session: StoreApi<SessionStore>,
): void {
  const { revalidate } = useRevalidator();
  const state = useSession(session);
  const viewerId = state.status === 'authenticated' ? state.user.id : null;
  const presence = table?.presence;
  const tabs = table?.tabs;
  const cast = table?.cast;
  useEffect(() => {
    if (!presence || !tabs || !cast || !viewerId) return;
    return followViewerRole({
      presence,
      tabs,
      cast,
      viewerId,
      revalidate: () => void revalidate(),
    });
  }, [presence, tabs, cast, viewerId, revalidate]);
}

function roleOf(members: readonly SessionMemberDto[], userId: string): CampaignRoleDto | null {
  return members.find((member) => member.userId === userId)?.role ?? null;
}

function onRoleChanged(deps: ViewerRoleDeps, role: CampaignRoleDto): void {
  const { tabs } = deps.tabs.getState();
  for (const tab of tabs) {
    tab.board.getState().resync();
    const interaction = tab.interaction.getState();
    if (!toolsOf(role).includes(interaction.tool)) interaction.setTool('select');
    interaction.allowLayerChoice(role === 'master');
  }
  deps.cast.getState().resync();
  deps.revalidate();
  visibleTabOf(deps.tabs.getState()).interaction.getState().say(roleChangedNotice(role));
}
