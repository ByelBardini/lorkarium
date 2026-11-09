import type { HexColorDto, MapRegionDto } from '@lorkarium/contracts';
import {
  MAP_POLYGON_VERTICES_MAX,
  MAP_POLYGON_VERTICES_MIN,
  mapRegionGeometry,
  type MapPoint,
  type MapRegionGeometry,
} from '@lorkarium/game-core';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { LibraryMapsApi, LibraryMapsFailureKind } from '@/services/library-maps-api';

export type MapDrawingTool = 'polygon' | 'pin';
/** Why a shape did not make it: the server's refusal, or `no_area` for what was never sent. */
export type MapDrawingFailure = LibraryMapsFailureKind | 'no_area';
/** Whether two points are the same spot for the hand; it depends on the zoom, so it comes from who
 *  knows the camera. */
export type SameMapSpot = (a: MapPoint, b: MapPoint) => boolean;
/** A region drawn ahead of what the server confirmed. */
export type MapMovedShape = Readonly<{ regionId: string; geometry: MapRegionGeometry }>;

export const MAP_REGION_DEFAULT_NAME = 'Novo lugar';
// The first of the drawing palette, so the form opens with its swatch marked.
export const MAP_REGION_DEFAULT_COLOR: HexColorDto = '#c5a46d';

export type MapDrawingFlow = Readonly<{
  /** `null`: nothing is being drawn. */
  tool: MapDrawingTool | null;
  /** The polygon so far. */
  vertices: readonly MapPoint[];
  /** The shape under the hand, or let go and not answered yet. */
  moved: MapMovedShape | null;
  /** A handle is in the hand. */
  grabbed: boolean;
  /** A POST or a PATCH is on its way; nothing else starts until it lands. */
  saving: boolean;
  failure: MapDrawingFailure | null;
  chooseTool: (tool: MapDrawingTool) => void;
  /** Leaves the drawing as it is, nothing sent. */
  stopDrawing: () => void;
  /** A click on the map: outside the image it is nothing. */
  clickMap: (point: MapPoint, sameSpot: SameMapSpot) => void;
  /** Enter: sends the polygon, if it has an area. */
  finishPolygon: () => void;
  /** Esc: a drag is put back, or the last vertex goes, or the drawing is over. */
  stepBack: () => void;
  grabHandle: (region: MapRegionDto, vertex: number) => void;
  /** Past the edge of the image the vertex stays on the edge. */
  dragHandle: (point: MapPoint) => void;
  /** Letting go: sends the shape, if it changed and has an area. */
  releaseHandle: () => void;
  /** The press was lost: the shape goes back, nothing sent. */
  dropHandle: () => void;
}>;

export type MapDrawingDeps = Readonly<{
  api: Pick<LibraryMapsApi, 'createRegion' | 'updateRegion'>;
  campaignId: string;
  mapId: string;
  onRegionCreated: (region: MapRegionDto) => void;
  onRegionMoved: (region: MapRegionDto) => void;
}>;

type GrabbedHandle = Readonly<{ region: MapRegionDto; vertex: number }>;
type Set = StoreApi<MapDrawingFlow>['setState'];
type Get = StoreApi<MapDrawingFlow>['getState'];

const IDLE_DRAWING = { tool: null, vertices: [] };

/** The shape work of a map's editor: the polygon or pin being drawn, sent as one POST when it
 *  closes, and the handle being dragged, sent as one PATCH when let go. A refusal leaves the
 *  confirmed shape on the screen and says why.
 *
 *  Example: `const flow = createMapDrawingFlow({ api, campaignId, mapId, onRegionCreated, onRegionMoved })` */
export function createMapDrawingFlow(deps: MapDrawingDeps): StoreApi<MapDrawingFlow> {
  return createStore<MapDrawingFlow>()((set, get) => {
    const drawing = new PolygonDrawing(deps, set, get);
    const handles = new HandleDrag(deps, set, get);
    return {
      ...IDLE_DRAWING,
      moved: null,
      grabbed: false,
      saving: false,
      failure: null,
      chooseTool: (tool) => drawing.choose(tool),
      stopDrawing: () => set({ ...IDLE_DRAWING, failure: null }),
      clickMap: (point, sameSpot) => drawing.click(point, sameSpot),
      finishPolygon: () => drawing.finish(),
      stepBack: () => (get().grabbed ? handles.drop() : drawing.stepBack()),
      grabHandle: (region, vertex) => handles.grab(region, vertex),
      dragHandle: (point) => handles.drag(point),
      releaseHandle: () => void handles.release(),
      dropHandle: () => handles.drop(),
    };
  });
}

/** React view of a slice of the drawing.
 *
 *  Example: `const tool = useMapDrawingFlow(flow, (state) => state.tool)` */
export function useMapDrawingFlow<T>(
  flow: StoreApi<MapDrawingFlow>,
  selector: (state: MapDrawingFlow) => T,
): T {
  return useStore(flow, selector);
}

class PolygonDrawing {
  constructor(
    private readonly deps: MapDrawingDeps,
    private readonly set: Set,
    private readonly get: Get,
  ) {}

  choose(tool: MapDrawingTool): void {
    if (!this.get().saving) this.set({ tool, vertices: [], failure: null });
  }

  click(point: MapPoint, sameSpot: SameMapSpot): void {
    const { tool, saving } = this.get();
    if (!tool || saving || !insideMap(point)) return;
    if (tool === 'polygon') return this.placeVertex(point, sameSpot);
    void this.send({ shape: 'pin', point });
  }

  finish(): void {
    const { tool, saving, vertices } = this.get();
    if (tool !== 'polygon' || saving) return;
    const geometry = validGeometry({ shape: 'polygon', points: [...vertices] });
    if (geometry) void this.send(geometry);
    else this.set({ failure: 'no_area' });
  }

  stepBack(): void {
    const { tool, saving, vertices } = this.get();
    if (saving || !tool) return;
    if (vertices.length === 0) return this.set({ ...IDLE_DRAWING, failure: null });
    this.set({ vertices: vertices.slice(0, -1), failure: null });
  }

  private placeVertex(point: MapPoint, sameSpot: SameMapSpot): void {
    const { vertices } = this.get();
    const first = vertices[0];
    if (first && sameSpot(point, first)) return this.closeOnFirstVertex();
    const last = vertices.at(-1);
    if (last && sameSpot(point, last)) return;
    if (vertices.length >= MAP_POLYGON_VERTICES_MAX) return;
    this.set({ vertices: [...vertices, point], failure: null });
    if (vertices.length + 1 === MAP_POLYGON_VERTICES_MAX) this.finish();
  }

  private closeOnFirstVertex(): void {
    if (this.get().vertices.length >= MAP_POLYGON_VERTICES_MIN) this.finish();
  }

  private async send(geometry: MapRegionGeometry): Promise<void> {
    const { api, campaignId, mapId, onRegionCreated } = this.deps;
    this.set({ saving: true, failure: null });
    const answer = await api.createRegion(campaignId, mapId, newRegionOf(geometry));
    if (!answer.ok) return this.set({ saving: false, failure: answer.failure.kind });
    this.set({ ...IDLE_DRAWING, saving: false });
    onRegionCreated(answer.value);
  }
}

class HandleDrag {
  private handle: GrabbedHandle | null = null;

  constructor(
    private readonly deps: MapDrawingDeps,
    private readonly set: Set,
    private readonly get: Get,
  ) {}

  grab(region: MapRegionDto, vertex: number): void {
    if (this.get().saving) return;
    this.handle = { region, vertex };
    this.set({ grabbed: true, failure: null });
  }

  drag(point: MapPoint): void {
    if (!this.handle) return;
    const { region, vertex } = this.handle;
    const geometry = withVertexAt(this.shapeInHand(region), vertex, clampedToMap(point));
    this.set({ moved: { regionId: region.id, geometry } });
  }

  drop(): void {
    if (!this.handle) return;
    this.handle = null;
    this.set({ grabbed: false, moved: null });
  }

  async release(): Promise<void> {
    const { handle } = this;
    const { moved } = this.get();
    if (!handle) return;
    if (!moved || sameGeometry(moved.geometry, handle.region.geometry)) return this.drop();
    const geometry = validGeometry(moved.geometry);
    if (!geometry) return this.refuseShape();
    this.handle = null;
    this.set({ grabbed: false, saving: true });
    await this.send(handle.region.id, geometry);
  }

  private shapeInHand(region: MapRegionDto): MapRegionGeometry {
    const { moved } = this.get();
    return moved?.regionId === region.id ? moved.geometry : region.geometry;
  }

  private refuseShape(): void {
    this.drop();
    this.set({ failure: 'no_area' });
  }

  private async send(regionId: string, geometry: MapRegionGeometry): Promise<void> {
    const { api, campaignId, mapId, onRegionMoved } = this.deps;
    const answer = await api.updateRegion(campaignId, mapId, regionId, { geometry });
    // Handed over first: the confirmed shape must be in place when the one ahead of it goes.
    if (answer.ok) onRegionMoved(answer.value);
    this.set({ moved: null, saving: false, failure: answer.ok ? null : answer.failure.kind });
  }
}

function newRegionOf(geometry: MapRegionGeometry) {
  return { name: MAP_REGION_DEFAULT_NAME, color: MAP_REGION_DEFAULT_COLOR, geometry };
}

function sameGeometry(a: MapRegionGeometry, b: MapRegionGeometry): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function insideMap({ x, y }: MapPoint): boolean {
  return x >= 0 && x <= 1 && y >= 0 && y <= 1;
}

function clampedToMap({ x, y }: MapPoint): MapPoint {
  return { x: Math.min(Math.max(x, 0), 1), y: Math.min(Math.max(y, 0), 1) };
}

function withVertexAt(
  geometry: MapRegionGeometry,
  vertex: number,
  point: MapPoint,
): MapRegionGeometry {
  if (geometry.shape === 'pin') return { shape: 'pin', point };
  return {
    shape: 'polygon',
    points: geometry.points.map((current, at) => (at === vertex ? point : current)),
  };
}

// The game-core's rule, the one the server applies: what it refuses is never sent.
function validGeometry(geometry: MapRegionGeometry): MapRegionGeometry | null {
  try {
    return mapRegionGeometry(geometry);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}
