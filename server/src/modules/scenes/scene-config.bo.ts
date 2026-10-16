import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';

/** The grid of a scene as the rule sees it: plain numbers, no persistence format. */
export type SceneGrid = Readonly<{
  widthCells: number;
  heightCells: number;
  cellDistance: number;
  cellUnit: string;
  gridVisible: boolean;
  gridOpacity: number;
}>;

/** Who may change the grid of the active scene: only the master (spec §3.2, §3.9).
 *
 *  Example: `new SceneConfigBo(access).configure(grid) // throws FORBIDDEN for a player` */
export class SceneConfigBo {
  constructor(private readonly access: CampaignAccessBo) {}

  configure(grid: SceneGrid): SceneGrid {
    this.access.requireMaster('configure the grid');
    return grid;
  }
}
