import type { CampaignRoleDto, SessionMemberDto } from '@lorkarium/contracts';
import type { BoardTool } from '@/stores/board-tool-state';

/** The room's tools each role may pick: the spectator only looks (select and the local ruler),
 *  the player also sketches, the master also draws walls and lights. */
const TOOLS_OF: Readonly<Record<CampaignRoleDto, readonly BoardTool[]>> = {
  master: ['select', 'ruler', 'draw', 'area', 'walls', 'lights'],
  player: ['select', 'ruler', 'draw', 'area'],
  spectator: ['select', 'ruler'],
};

/** Whether this role only watches the table: no command leaves the room, no edit control shows.
 *
 *  Example: `watchesOnly(campaign.myRole) // true for 'spectator'` */
export function watchesOnly(role: CampaignRoleDto): boolean {
  return role === 'spectator';
}

/** The tools of the toolbar (and their keys) this role may pick.
 *
 *  Example: `toolsOf('spectator').includes('draw') // false` */
export function toolsOf(role: CampaignRoleDto): readonly BoardTool[] {
  return TOOLS_OF[role];
}

/** The ids of the table's players, sorted: the tokens they control are the spectator's eyes. A
 *  master or a spectator listed in `controllerIds` is never one.
 *
 *  Example: `playerIdsOf(presence.getState().members) // [biaId, caioId]` */
export function playerIdsOf(
  members: readonly Pick<SessionMemberDto, 'userId' | 'role'>[],
): string[] {
  return members
    .filter(({ role }) => role === 'player')
    .map(({ userId }) => userId)
    .sort();
}
