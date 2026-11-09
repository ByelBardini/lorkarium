import type { CampaignRoleDto, LibraryMapDetailDto, MapRegionDto } from '@lorkarium/contracts';
import type { MapPoint } from '@lorkarium/game-core';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { AppDependencies } from '@/app/router';
import { useLibraryTable } from '@/features/library/use-library-table';
import { sameMapSpot } from '@/lib/map-viewport';
import type { LibraryApi } from '@/services/library-api';
import type { MapWorkspaceEntry } from '@/stores/document-workspace-store';
import {
  useMapDrawingFlow,
  type MapDrawingFlow,
  type MapDrawingTool,
  type MapMovedShape,
} from '@/stores/map-drawing-flow';
import { useMapView } from '@/stores/map-view-store';
import { useSession } from '@/stores/session-store';
import type { MapCanvasEditing, MapCanvasScene } from './map-canvas';
import { MapDrawingDraft } from './map-drawing-draft';
import type { LinkableLibrary } from './map-link-picker';
import { MapRegionHandles } from './map-region-handles';
import { useMapDrawing } from './use-map-drawing';

export type MapEditorOptions = Readonly<{
  deps: AppDependencies;
  entry: MapWorkspaceEntry;
  map: LibraryMapDetailDto;
}>;

type LinkableLibraryRead = Readonly<{ library: LinkableLibrary; failed: boolean }>;

export type MapEditor = LinkableLibraryRead &
  Readonly<{
    /** By the reader's role now: a master demoted in the session loses the editor. */
    master: boolean;
    live: boolean;
    editing: boolean;
    flow: StoreApi<MapDrawingFlow>;
    /** The map to draw: the confirmed one, with the shape in hand ahead of it. */
    shownMap: LibraryMapDetailDto;
    /** What the canvas needs while editing. */
    canvas: MapCanvasEditing | undefined;
    open: () => void;
    close: () => void;
    /** Takes up a tool, or puts away the one in hand. */
    toggleTool: (tool: MapDrawingTool) => void;
  }>;

const NOTHING_READ: LinkableLibraryRead = {
  library: { documents: [], scenes: [], maps: [], images: [], folders: [] },
  failed: false,
};

/** The master's editor over a map: whether it may open, the drawing, and the library the link of a
 *  place picks from. Opened on one map: following a link away closes it.
 *
 *  Example: `const editor = useMapEditor({ deps, entry, map })` */
export function useMapEditor({ deps, entry, map }: MapEditorOptions): MapEditor {
  const { view, campaign } = entry;
  const { table, live } = useLibraryTable(deps.openTables, campaign.id);
  const reader = useMapEditorReader(deps, entry, table);
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const master = reader.role === 'master';
  const editing = master && openedOn === map.id;
  const flow = useMapDrawing({
    api: deps.libraryMapsApi,
    view,
    campaignId: campaign.id,
    mapId: map.id,
    active: editing && live,
  });
  const shownMap = useMapWithShapeInHand(map, flow);
  const read = useLinkableLibrary(deps.libraryApi, campaign.id, editing, reader.revision);
  const canvas = useEditorCanvas({ entry, shownMap, flow, editing, live });
  return {
    ...read,
    master,
    live,
    editing,
    flow,
    shownMap,
    canvas,
    open: () => setOpenedOn(map.id),
    close: () => {
      flow.getState().stopDrawing();
      setOpenedOn(null);
    },
    toggleTool: (tool) => toggleDrawingTool(entry, flow, tool),
  };
}

function toggleDrawingTool(
  { view }: MapWorkspaceEntry,
  flow: StoreApi<MapDrawingFlow>,
  tool: MapDrawingTool,
): void {
  if (flow.getState().tool === tool) return flow.getState().stopDrawing();
  view.getState().selectRegion(null);
  flow.getState().chooseTool(tool);
}

type EditorTable = ReturnType<typeof useLibraryTable>['table'];
type EditorReader = Readonly<{ role: CampaignRoleDto; revision: number }>;

function useMapEditorReader(
  deps: AppDependencies,
  entry: MapWorkspaceEntry,
  table: EditorTable,
): EditorReader {
  const session = useSession(deps.sessionStore);
  const userId = session.status === 'authenticated' ? session.user.id : '';
  const subscribe = useCallback(
    (changed: () => void) => {
      const unsubscribeTabs = table?.tabs.subscribe(changed);
      const unsubscribePresence = table?.presence.subscribe(changed);
      return () => {
        unsubscribeTabs?.();
        unsubscribePresence?.();
      };
    },
    [table],
  );
  const members = () => table?.presence.getState().members ?? [];
  const role = useSyncExternalStore(
    subscribe,
    () => members().find((member) => member.userId === userId)?.role ?? entry.campaign.myRole,
  );
  const revision = useSyncExternalStore(
    subscribe,
    () => table?.tabs.getState().libraryRevision ?? 0,
  );
  return { role, revision };
}

function useMapWithShapeInHand(
  map: LibraryMapDetailDto,
  flow: StoreApi<MapDrawingFlow>,
): LibraryMapDetailDto {
  const moved = useMapDrawingFlow(flow, (state) => state.moved);
  return useMemo(() => withShape(map, moved), [map, moved]);
}

function withShape(map: LibraryMapDetailDto, moved: MapMovedShape | null): LibraryMapDetailDto {
  if (!moved) return map;
  const { regionId, geometry } = moved;
  return {
    ...map,
    regions: map.regions.map((region) =>
      region.id === regionId ? { ...region, geometry } : region,
    ),
  };
}

function useLinkableLibrary(
  api: Pick<LibraryApi, 'list'>,
  campaignId: string,
  enabled: boolean,
  revision: number,
): LinkableLibraryRead {
  const [read, setRead] = useState(NOTHING_READ);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    void api.list(campaignId).then((answer) => {
      if (!current) return;
      if (answer.ok) setRead({ library: answer.value, failed: false });
      else setRead((previous) => ({ ...previous, failed: true }));
    });
    return () => {
      current = false;
    };
  }, [api, campaignId, enabled, revision]);
  return read;
}

type EditorCanvasOptions = Readonly<{
  entry: MapWorkspaceEntry;
  shownMap: LibraryMapDetailDto;
  flow: StoreApi<MapDrawingFlow>;
  editing: boolean;
  live: boolean;
}>;

function useEditorCanvas(options: EditorCanvasOptions): MapCanvasEditing | undefined {
  const { entry, shownMap, flow, editing, live } = options;
  const drawing = useMapDrawingFlow(flow, (state) => state.tool !== null);
  const selectedId = useMapView(entry.view, (state) => state.selectedRegionId);
  if (!editing) return undefined;
  const selected = shownMap.regions.find(({ id }) => id === selectedId) ?? null;
  return {
    onMapPoint: drawing && live ? (point, scene) => clickOnMap(flow, point, scene) : undefined,
    overlay: (scene) => (
      <EditorOverlay flow={flow} scene={scene} selected={live ? selected : null} />
    ),
  };
}

function clickOnMap(
  flow: StoreApi<MapDrawingFlow>,
  point: MapPoint,
  { camera, image }: MapCanvasScene,
): void {
  flow.getState().clickMap(point, (a, b) => sameMapSpot(camera, image, a, b));
}

type EditorOverlayProps = Readonly<{
  flow: StoreApi<MapDrawingFlow>;
  scene: MapCanvasScene;
  selected: MapRegionDto | null;
}>;

function EditorOverlay({ flow, scene, selected }: EditorOverlayProps): React.JSX.Element | null {
  const vertices = useMapDrawingFlow(flow, (state) => state.vertices);
  const tool = useMapDrawingFlow(flow, (state) => state.tool);
  if (tool) return <MapDrawingDraft vertices={vertices} scene={scene} />;
  if (!selected) return null;
  return <MapRegionHandles region={selected} scene={scene} flow={flow} />;
}
