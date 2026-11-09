import type { CampaignDetailDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import type { DocumentWorkspaceStore } from '@/stores/document-workspace-store';

export type MapRegionAddress = Readonly<{
  campaign: CampaignDetailDto;
  mapId: string;
  mapName: string;
  regionId: string;
}>;

/** Shows a map in the table's map tab, centered on a region and with its card open. Works before
 *  the map arrives; a region that is no longer there leaves just the map.
 *
 *  Example: `openMapAtRegion(workspace, { campaign, mapId, mapName: 'Mundo', regionId })` */
export function openMapAtRegion(
  workspace: StoreApi<DocumentWorkspaceStore>,
  { regionId, ...map }: MapRegionAddress,
): void {
  const key = workspace.getState().openMap(map);
  const entry = workspace.getState().maps.find((item) => item.key === key);
  entry?.view.getState().focusRegion(regionId);
}
