import type { CampaignDetailDto, LibraryMapSummaryDto } from '@lorkarium/contracts';
import { createContext, useCallback, useEffect, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { LibraryMapsApi, LibraryMapsResult } from '@/services/library-maps-api';
import {
  mapWorkspaceKey,
  useDocumentWorkspaceSlice,
  type DocumentWorkspaceStore,
} from '@/stores/document-workspace-store';
import { useSceneTabs, type SceneTabsStore } from '@/stores/scene-tabs-store';

export type MainMapReader = Pick<LibraryMapsApi, 'main'>;

/** How the room reads the main map: a context because the room page already passes too much, and
 *  only its title needs this. Without one the title stays plain text.
 *
 *  Example: `<MainMapReaderContext value={deps.libraryMapsApi}>…</MainMapReaderContext>` */
export const MainMapReaderContext = createContext<MainMapReader | null>(null);

export type MapHomeDeps = Readonly<{
  campaign: CampaignDetailDto;
  tabs: StoreApi<SceneTabsStore>;
  workspace: StoreApi<DocumentWorkspaceStore>;
  reader: MainMapReader;
}>;

export type MapHome = Readonly<{
  /** The table has a main map the reader can go back to. */
  hasHome: boolean;
  /** The main map is what the room shows now. */
  homeShown: boolean;
  /** Shows the main map in the table's map tab. */
  openHome: () => void;
}>;

type MainMap = LibraryMapSummaryDto | null;
type ShowMap = (map: LibraryMapSummaryDto) => void;

/** The main map as the home of the table: it opens by itself once per visit, the title goes back
 *  to it, and the map tab gives way when the group is taken to another grid.
 *
 *  Example: `const { hasHome, openHome } = useMapHome({ campaign, tabs, workspace, reader })` */
export function useMapHome(deps: MapHomeDeps): MapHome {
  const { campaign, workspace } = deps;
  const showMap = useCallback<ShowMap>(
    (map) =>
      void workspace
        .getState()
        .openMap({ campaign, mapId: map.id, mapName: map.name, showsMainMap: true }),
    [workspace, campaign],
  );
  const mainMap = useMainMap(deps, showMap);
  useMapTabGivesWayToGroup(deps);
  return {
    hasHome: mainMap !== null,
    homeShown: useDocumentWorkspaceSlice(
      workspace,
      (state) => isMainMapShown(state, campaign.id),
      false,
    ),
    openHome: () => mainMap && showMap(mainMap),
  };
}

function isMainMapShown(state: DocumentWorkspaceStore, campaignId: string): boolean {
  const key = mapWorkspaceKey(campaignId);
  return (
    state.activeByCampaign[campaignId] === key &&
    state.maps.some((map) => map.key === key && map.showsMainMap)
  );
}

// Read again at each `library:changed`, which is how a main map marked or unmarked gets here.
function useMainMap(deps: MapHomeDeps, showMap: ShowMap): MainMap {
  const { campaign, tabs, workspace, reader } = deps;
  const libraryRevision = useSceneTabs(tabs, (state) => state.libraryRevision);
  const [mainMap, setMainMap] = useState<MainMap>(null);
  useEffect(() => {
    let current = true;
    void reader.main(campaign.id).then((result) => {
      if (!current) return;
      if (result.ok) setMainMap(result.value);
      arriveOnce(result, tabs, arrivalShow(campaign.id, workspace, showMap));
    });
    return () => {
      current = false;
    };
  }, [reader, campaign.id, tabs, workspace, showMap, libraryRevision]);
  return mainMap;
}

// The first answer of the visit decides, even a failed one: a later one comes from a change in the
// library, and a map popping up in the middle of the session would be a surprise.
function arriveOnce(
  result: LibraryMapsResult<MainMap>,
  tabs: StoreApi<SceneTabsStore>,
  showMap: ShowMap,
): void {
  if (tabs.getState().arrivedAtHome) return;
  tabs.setState({ arrivedAtHome: true });
  if (result.ok && result.value) showMap(result.value);
}

// What the person opened while the answer travelled stays on screen. The map tab itself does not
// count: it can outlive leaving the table, and the arrival starts it over at the main map.
function arrivalShow(
  campaignId: string,
  workspace: StoreApi<DocumentWorkspaceStore>,
  showMap: ShowMap,
): ShowMap {
  return (map) => {
    const active = workspace.getState().activeByCampaign[campaignId] ?? null;
    if (active === null || active === mapWorkspaceKey(campaignId)) showMap(map);
  };
}

function useMapTabGivesWayToGroup({ campaign, tabs, workspace }: MapHomeDeps): void {
  const campaignId = campaign.id;
  useEffect(
    () =>
      tabs.subscribe((state, previous) => {
        if (state.sceneActivations === previous.sceneActivations) return;
        const { activeByCampaign, activate } = workspace.getState();
        if (activeByCampaign[campaignId] !== mapWorkspaceKey(campaignId)) return;
        activate(campaignId, null);
      }),
    [tabs, workspace, campaignId],
  );
}
