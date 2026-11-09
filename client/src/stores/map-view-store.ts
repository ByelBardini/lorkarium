import type { LibraryMapDetailDto, MapRegionDto } from '@lorkarium/contracts';
import type { MapPoint } from '@lorkarium/game-core';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Camera } from '@/renderer/camera';
import type { LibraryMapsApi, LibraryMapsResult } from '@/services/library-maps-api';

/** `not_found` = deleted, or this reader may no longer see it. */
export type MapViewStatus = 'loading' | 'ready' | 'failed' | 'not_found';

/** A map left behind on the way to the one shown, and where its view was. */
export type MapTrailStep = Readonly<{ mapId: string; name: string; camera: Camera | null }>;

/** How a move along the trail ended; `dropped` = another move or a restart came after it. */
export type MapTravelOutcome = 'arrived' | 'not_found' | 'failed' | 'dropped';

export type MapViewState = Readonly<{
  mapId: string;
  status: MapViewStatus;
  /** The confirmed map, as this reader may know it; gone with its access. */
  map: LibraryMapDetailDto | null;
  /** Lives here, not in the canvas: the panel remounts when the room changes tabs. `null` until
   *  the canvas has measured itself and framed the map. */
  camera: Camera | null;
  /** The maps left on the way to the one shown, oldest first; empty when reached directly. */
  trail: readonly MapTrailStep[];
  /** The region whose card is open. */
  selectedRegionId: string | null;
  /** The point of the map that was clicked to open the card; `null` when no click did it. */
  selectedAnchor: MapPoint | null;
  /** A region waiting for the canvas to bring it to the middle of the window. */
  focusRegionId: string | null;
  /** Reads the map shown again; a failure over a map already on screen keeps it. */
  load: () => Promise<void>;
  /** Restarts on a map: the trail is cleared. It is what opening by the library or by the table's
   *  name does (`openMap` of the workspace), framed anew; the same map is just read again. */
  show: (mapId: string) => Promise<void>;
  /** Follows a link to another map, keeping this one in the trail. The map on screen stays until
   *  the next one is read, so a target out of reach costs nothing. */
  enter: (mapId: string) => Promise<MapTravelOutcome>;
  /** Back to the map left last. */
  goBack: () => Promise<MapTravelOutcome>;
  /** Back to a step of the trail, dropping the ones after it. */
  returnTo: (index: number) => Promise<MapTravelOutcome>;
  setCamera: (camera: Camera) => void;
  selectRegion: (regionId: string | null, anchor?: MapPoint | null) => void;
  /** Selects a region and asks the canvas to center it, now or as soon as it can measure itself. */
  focusRegion: (regionId: string) => void;
  /** The canvas's answer to `focusRegion`: the camera on the region, `null` if it is not there. */
  landFocus: (camera: Camera | null) => void;
  /** A region the server has just confirmed, on the map shown; ignored once another map is. */
  applyRegion: (mapId: string, region: MapRegionDto) => void;
  /** A region the server has just removed, and its card with it. */
  dropRegion: (mapId: string, regionId: string) => void;
  /** Answers still on the way after this are dropped. */
  dispose: () => void;
}>;

export type MapViewDeps = Readonly<{
  api: LibraryMapsApi;
  campaignId: string;
  mapId: string;
}>;

/** The map open in a table's map tab: its confirmed detail, read by the route and replaced only by
 *  what is at least as new, the view's camera over it, and the trail of maps that led to it.
 *
 *  Example: `const view = createMapViewStore({ api, campaignId, mapId }); await view.getState().load()` */
export function createMapViewStore(deps: MapViewDeps): StoreApi<MapViewState> {
  return createStore<MapViewState>()((set, get) => {
    const reads = new MapReads(deps, set, get);
    return {
      mapId: deps.mapId,
      status: 'loading',
      map: null,
      camera: null,
      trail: [],
      selectedRegionId: null,
      selectedAnchor: null,
      focusRegionId: null,
      load: () => reads.load(),
      show: (mapId) => reads.show(mapId),
      enter: (mapId) => reads.enter(mapId),
      goBack: () => reads.returnTo(get().trail.length - 1),
      returnTo: (index) => reads.returnTo(index),
      setCamera: (camera) => set({ camera }),
      selectRegion: (selectedRegionId, selectedAnchor = null) =>
        set({ selectedRegionId, selectedAnchor }),
      focusRegion: (regionId) =>
        set({ selectedRegionId: regionId, selectedAnchor: null, focusRegionId: regionId }),
      landFocus: (camera) =>
        set(
          camera
            ? { camera, focusRegionId: null }
            : { focusRegionId: null, selectedRegionId: null },
        ),
      applyRegion: (mapId, region) => set(withRegionApplied(get(), mapId, region)),
      dropRegion: (mapId, regionId) => set(withRegionDropped(get(), mapId, regionId)),
      dispose: () => reads.dispose(),
    };
  });
}

/** React view of a slice of an open map.
 *
 *  Example: `const camera = useMapView(view, (state) => state.camera)` */
export function useMapView<T>(
  view: StoreApi<MapViewState>,
  selector: (state: MapViewState) => T,
): T {
  return useStore(view, selector);
}

// The version stays as it was read: only the next read (`library:mapChanged`) says the server's.
function withRegionApplied(
  { map }: MapViewState,
  mapId: string,
  region: MapRegionDto,
): Partial<MapViewState> {
  if (map?.id !== mapId) return {};
  const known = map.regions.some(({ id }) => id === region.id);
  const regions = known
    ? map.regions.map((current) => (current.id === region.id ? region : current))
    : [...map.regions, region];
  return { map: { ...map, regions } };
}

function withRegionDropped(
  { map, selectedRegionId }: MapViewState,
  mapId: string,
  regionId: string,
): Partial<MapViewState> {
  if (map?.id !== mapId) return {};
  return {
    map: { ...map, regions: map.regions.filter(({ id }) => id !== regionId) },
    selectedRegionId: selectedRegionId === regionId ? null : selectedRegionId,
  };
}

type MapTrip = Readonly<{
  mapId: string;
  /** Read at the arrival, so the step left behind has the camera of the last moment. */
  landing: () => Partial<MapViewState>;
  lost?: () => Partial<MapViewState>;
}>;

const NO_REGION_IN_HAND = { selectedRegionId: null, selectedAnchor: null, focusRegionId: null };

class MapReads {
  // Only the last read asked for may land: an older answer would bring back what came after it.
  private lastRead = 0;
  private disposed = false;
  private travelling = false;

  constructor(
    private readonly deps: MapViewDeps,
    private readonly set: StoreApi<MapViewState>['setState'],
    private readonly get: StoreApi<MapViewState>['getState'],
  ) {}

  async load(): Promise<void> {
    // The trip ends in a read of its own; a read of the map being left would cancel it.
    if (this.travelling) return;
    const read = ++this.lastRead;
    const result = await this.read(this.get().mapId);
    if (read !== this.lastRead || this.disposed) return;
    this.settle(result);
  }

  show(mapId: string): Promise<void> {
    this.travelling = false;
    // One write: between two, a subscriber would see the old map and take its name back to the tab.
    const leaving =
      mapId === this.get().mapId
        ? {}
        : { mapId, status: 'loading' as const, map: null, camera: null, ...NO_REGION_IN_HAND };
    this.set({ trail: [], ...leaving });
    return this.load();
  }

  enter(mapId: string): Promise<MapTravelOutcome> {
    const { trail, mapId: shown } = this.get();
    const index = trail.findIndex((step) => step.mapId === mapId);
    if (index >= 0) return this.returnTo(index);
    if (mapId === shown) return Promise.resolve('arrived');
    return this.travel({
      mapId,
      landing: () => ({ trail: this.trailWithShownMap(), camera: null }),
    });
  }

  returnTo(index: number): Promise<MapTravelOutcome> {
    const { trail } = this.get();
    const step = trail[index];
    if (!step) return Promise.resolve('dropped');
    return this.travel({
      mapId: step.mapId,
      landing: () => ({ trail: trail.slice(0, index), camera: step.camera }),
      lost: () => ({ trail: trail.filter((_, at) => at !== index) }),
    });
  }

  dispose(): void {
    this.disposed = true;
  }

  private read(mapId: string): Promise<LibraryMapsResult<LibraryMapDetailDto>> {
    return this.deps.api.detail(this.deps.campaignId, mapId);
  }

  private async travel(trip: MapTrip): Promise<MapTravelOutcome> {
    const read = ++this.lastRead;
    this.travelling = true;
    const result = await this.read(trip.mapId);
    if (read !== this.lastRead || this.disposed) return 'dropped';
    this.travelling = false;
    if (result.ok) return this.arrive(result.value, trip);
    if (result.failure.kind !== 'not_found') return 'failed';
    if (trip.lost) this.set(trip.lost());
    // What it said about that map changed too: a link now locked must read as locked.
    void this.load();
    return 'not_found';
  }

  private arrive(map: LibraryMapDetailDto, trip: MapTrip): MapTravelOutcome {
    this.set({ ...trip.landing(), mapId: map.id, map, status: 'ready', ...NO_REGION_IN_HAND });
    return 'arrived';
  }

  private trailWithShownMap(): readonly MapTrailStep[] {
    const { map, camera, trail } = this.get();
    return map ? [...trail, { mapId: map.id, name: map.name, camera }] : trail;
  }

  private settle(result: LibraryMapsResult<LibraryMapDetailDto>): void {
    if (result.ok) return this.adopt(result.value);
    if (result.failure.kind === 'not_found') return this.set({ status: 'not_found', map: null });
    if (!this.get().map) this.set({ status: 'failed' });
  }

  private adopt(incoming: LibraryMapDetailDto): void {
    if (replacesMap(incoming, this.get().map)) this.set({ map: incoming, status: 'ready' });
  }
}

// An older version never replaces a newer one. The same version may still read differently: what
// this reader may see of it (a link unlocked, the reader's role) changes without a write on the map.
function replacesMap(incoming: LibraryMapDetailDto, current: LibraryMapDetailDto | null): boolean {
  if (!current || current.id !== incoming.id) return true;
  if (incoming.version !== current.version) return incoming.version > current.version;
  return JSON.stringify(incoming) !== JSON.stringify(current);
}
