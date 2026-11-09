import type { CampaignDetailDto, LibraryMapDetailDto } from '@lorkarium/contracts';
import {
  activateItem,
  detachedItem,
  mapWorkspaceKey,
  removeItem,
  type Workspace,
} from './document-workspace-ops';
import type { MapWorkspaceEntry } from './document-workspace-store';
import { createMapViewStore, type MapViewState } from './map-view-store';

export type OpenMap = Readonly<{
  campaign: CampaignDetailDto;
  mapId: string;
  mapName: string;
  /** Whether this map is the table's main one, which has no tab. Left out by who cannot know: it
   *  counts as yes until the map is read, or a tab would blink and go away. */
  showsMainMap?: boolean;
}>;

/** Opens the table's map tab on a map, or moves the tab already open to it; returns its key.
 *
 *  Example: `const key = openMap(workspace, { campaign, mapId, mapName })` */
export function openMap(workspace: Workspace, input: OpenMap): string {
  const key = mapWorkspaceKey(input.campaign.id);
  const open = workspace.get().maps.find((item) => item.key === key);
  if (open) {
    patchMap(workspace, key, {
      campaign: input.campaign,
      ...tabFactsOf(input, open.view.getState().map),
    });
    activateItem(workspace, input.campaign.id, key);
    void open.view.getState().show(input.mapId);
    return key;
  }
  const entry: MapWorkspaceEntry = {
    ...detachedItem(key, input.campaign),
    kind: 'map',
    ...tabFactsOf(input, null),
    view: createMapViewStore({
      api: workspace.options.mapsApi,
      campaignId: input.campaign.id,
      mapId: input.mapId,
    }),
  };
  workspace.set((state) => ({ maps: [...state.maps, entry] }));
  activateItem(workspace, input.campaign.id, key);
  workspace.subscriptions.set(key, followMap(workspace, entry));
  void entry.view.getState().load();
  return key;
}

type MapTabFacts = Pick<MapWorkspaceEntry, 'mapName' | 'showsMainMap'>;

// The map already on screen knows better than the caller, and re-reading it changes nothing in the
// view, so nothing would come to correct the tab.
function tabFactsOf(input: OpenMap, shown: LibraryMapDetailDto | null): MapTabFacts {
  if (shown?.id === input.mapId) return tabFactsOfRead(shown);
  return { mapName: input.mapName, showsMainMap: input.showsMainMap ?? true };
}

function tabFactsOfRead({ name, isMain }: LibraryMapDetailDto): MapTabFacts {
  return { mapName: name, showsMainMap: isMain };
}

// A map the reader may no longer see (deleted, made private) reads as 404; a renamed one renames
// its tab, and one that became (or stopped being) the main map takes its tab away (or gets one).
function followMap(workspace: Workspace, entry: MapWorkspaceEntry): () => void {
  return entry.view.subscribe((state) => {
    if (state.status === 'not_found') return closeLostMap(workspace, entry);
    syncTabWithRead(workspace, entry.key, state);
  });
}

function syncTabWithRead(workspace: Workspace, key: string, { map }: MapViewState): void {
  const open = mapEntryOf(workspace, key);
  if (!map || !open) return;
  const facts = tabFactsOfRead(map);
  if (open.mapName !== facts.mapName || open.showsMainMap !== facts.showsMainMap)
    patchMap(workspace, key, facts);
}

function mapEntryOf(workspace: Workspace, key: string): MapWorkspaceEntry | undefined {
  return workspace.get().maps.find((item) => item.key === key);
}

function patchMap(workspace: Workspace, key: string, changes: Partial<MapWorkspaceEntry>): void {
  workspace.set((state) => ({
    maps: state.maps.map((item) => (item.key === key ? { ...item, ...changes } : item)),
  }));
}

function closeLostMap(workspace: Workspace, entry: MapWorkspaceEntry): void {
  const name = mapEntryOf(workspace, entry.key)?.mapName ?? entry.mapName;
  removeItem(workspace, entry.key);
  workspace.set({
    notice: {
      campaignId: entry.campaign.id,
      message: `O mapa ${name} foi fechado: ele foi excluído ou você não pode mais vê-lo.`,
    },
  });
}
