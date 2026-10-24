import type { SceneClosedReasonDto } from '@lorkarium/contracts';

/** The group of a table going from one grid to another (`scene:activate`). */
export type TableMove = Readonly<{
  campaignId: string;
  sceneId: string;
  /** The group grid until now, `null` for a table that had none. */
  previous: Readonly<{
    sceneId: string;
    /** A player who had it open as a tab keeps it only while it is public; masters always do. */
    playersKeepTabs: boolean;
  }> | null;
  at: string;
}>;

/** Who loses one grid: its players only (it became private) or everyone (it was deleted). */
export type GridEviction = Readonly<{
  campaignId: string;
  sceneId: string;
  audience: 'players' | 'everyone';
  reason: SceneClosedReasonDto;
  at: string;
}>;

/** Who is in the rooms of each grid, changed after a commit that changed who reaches it.
 *  Adapter in `server/src/infrastructure/scene-audience/`. */
export interface SceneAudiencePort {
  /** Every socket of the table enters the rooms of the new group grid before leaving the old
   *  one's (the sheet and the condition list travel through the group grid's rooms); who did
   *  not open the old one as a tab, or no longer reaches it, leaves it. */
  moveTable(move: TableMove): Promise<void>;
  /** Takes `audience` out of the rooms of the grid, forgets their tab and tells each socket
   *  `scene:closed`. */
  evict(eviction: GridEviction): Promise<void>;
}
