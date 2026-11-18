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

/** What a grid past its owner's plan keeps: the grid in numbers and its background. */
export type SceneSetup = SceneGrid & Readonly<{ backgroundAssetId: string | null }>;

const SETUP_KEYS = [
  'widthCells',
  'heightCells',
  'cellDistance',
  'cellUnit',
  'gridVisible',
  'gridOpacity',
] as const satisfies readonly (keyof SceneGrid)[];

/** Whether a configure changes the grid's setup: its size, ruler, lines or background (`undefined`
 *  keeps the background). The vision mode and the free movement are play, never setup.
 *
 *  Example: `changesGridSetup(stored, { ...grid, cellDistance: 3 }, undefined) // true` */
export function changesGridSetup(
  stored: SceneSetup,
  grid: SceneGrid,
  background: string | null | undefined,
): boolean {
  if (background !== undefined && background !== stored.backgroundAssetId) return true;
  return SETUP_KEYS.some((key) => stored[key] !== grid[key]);
}
