import type { CampaignDetailDto } from '@lorkarium/contracts';
import { useEffect } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { useOpenTableOf } from '@/features/chat/use-chat-people';
import type { DocumentWorkspaceStore } from '@/stores/document-workspace-store';
import type { OpenTablesStore } from '@/stores/open-tables-store';
import type { SceneTabsState } from '@/stores/scene-tabs-store';
import { openMapAtRegion } from './open-map-at-region';

// The event carries no name, so a hidden map's name never crosses the socket; the tab says this
// only until the map is read.
const MAP_NAME_UNTIL_READ = 'Mapa';

export type RoomMapFocusProps = Readonly<{
  campaign: CampaignDetailDto;
  openTables: StoreApi<OpenTablesStore>;
  workspace: StoreApi<DocumentWorkspaceStore>;
  /** A page (settings, conditions) covers the room: whoever is there is not looking at it. */
  covered: boolean;
}>;

/** Brings whoever is in the room to the region the master showed: the map opens, centered on it.
 *  Mounted beside the room and not in its top bar, which focus mode takes away.
 *
 *  Example: `<RoomMapFocus campaign={campaign} openTables={openTables} workspace={workspace} covered={false} />` */
export function RoomMapFocus(props: RoomMapFocusProps): null {
  const { campaign, openTables, workspace, covered } = props;
  const tabs = useOpenTableOf(openTables, campaign.id)?.tabs ?? null;
  useEffect(() => {
    if (!tabs || covered) return;
    return tabs.subscribe((state, previous) =>
      takeToRegionShown(state, previous, workspace, campaign),
    );
  }, [tabs, covered, workspace, campaign]);
  return null;
}

// Only what arrives while subscribed: a presentation is of the moment, and one missed away from
// the room must not pop up on the way back.
function takeToRegionShown(
  { regionShown }: SceneTabsState,
  previous: SceneTabsState,
  workspace: StoreApi<DocumentWorkspaceStore>,
  campaign: CampaignDetailDto,
): void {
  if (!regionShown || regionShown === previous.regionShown) return;
  const { mapId, regionId } = regionShown;
  openMapAtRegion(workspace, { campaign, mapId, mapName: MAP_NAME_UNTIL_READ, regionId });
}
