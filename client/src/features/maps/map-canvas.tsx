import type { LibraryMapDetailDto, MapRegionDto } from '@lorkarium/contracts';
import { regionFocusPoint, regionsPaintOrder, type MapPoint } from '@lorkarium/game-core';
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { fitMap, focusMapOn, screenToMapPoint } from '@/lib/map-viewport';
import type { Camera, Size } from '@/renderer/camera';
import { assetUrlOf } from '@/services/assets-api';
import { useMapView, type MapViewState } from '@/stores/map-view-store';
import { MapRegionShape } from './map-region-shape';
import { sizeOfElement, useMapGestures } from './use-map-gestures';

const UNFRAMED: Camera = { offsetX: 0, offsetY: 0, zoom: 1 };
const PANNING_CURSOR = 'cursor-grab active:cursor-grabbing';
const DRAWING_CURSOR = 'cursor-crosshair [&_[data-region-id]]:cursor-crosshair';

/** The view at the moment of an editing gesture. */
export type MapCanvasScene = Readonly<{ image: Size; camera: Camera }>;

export type MapCanvasEditing = Readonly<{
  /** Set while drawing: a click on the map gives its point, and the regions stop answering it. */
  onMapPoint?: (point: MapPoint, scene: MapCanvasScene) => void;
  /** Drawn over the regions, in the image's pixels. */
  overlay: (scene: MapCanvasScene) => ReactNode;
}>;

export type MapCanvasProps = Readonly<{
  map: LibraryMapDetailDto;
  view: StoreApi<MapViewState>;
  /** `clickedAt` is the point under the pointer; `null` when the keyboard chose the region. */
  onSelectRegion?: (region: MapRegionDto, clickedAt: MapPoint | null) => void;
  /** A double click, or Enter on a region that has somewhere to go. */
  onOpenRegion?: (region: MapRegionDto) => void;
  /** The master's editor, while it is open. */
  editing?: MapCanvasEditing;
}>;

/** A map's image with its regions drawn over it in SVG, with pan and zoom by transform. The
 *  camera is the view's; regions go in `regionsPaintOrder`, so the small ones stay clickable.
 *
 *  Example: `<MapCanvas key={map.id} map={map} view={view} onSelectRegion={openCard} />` */
export function MapCanvas(props: MapCanvasProps): React.JSX.Element {
  const { map, view } = props;
  const onMapPoint = props.editing?.onMapPoint;
  const frame = useRef<HTMLDivElement>(null);
  const { width, height } = map.asset;
  const image = useMemo(() => ({ width, height }), [width, height]);
  const camera = useMapView(view, (state) => state.camera);
  const selectedRegionId = useMapView(view, (state) => state.selectedRegionId);
  const gestures = useMapGestures(frame, view, image);
  useFrameOnArrival(frame, view, image, camera);
  useLandFocus(frame, view, map, image);
  const [attempt, setAttempt] = useState(0);
  const [failedAttempt, setFailedAttempt] = useState<number | null>(null);
  const lastClick = useLastClickPoint(image, camera);
  const letGo = (event: MouseEvent<HTMLElement>): void => {
    if (gestures.wasDragged()) return;
    if (onMapPoint) giveMapPoint(event, onMapPoint, { image, camera });
    else letGoOfSelection(event, view);
  };
  return (
    <div
      ref={frame}
      {...gestures.frameHandlers}
      onClickCapture={lastClick.remember}
      onClick={letGo}
      className={`relative min-h-0 flex-1 touch-none overflow-hidden bg-background select-none ${onMapPoint ? DRAWING_CURSOR : PANNING_CURSOR}`}
    >
      {failedAttempt === attempt ? (
        <MapImageFailed onRetry={() => setAttempt(attempt + 1)} />
      ) : (
        <>
          <MapLayers
            map={map}
            image={image}
            camera={camera}
            attempt={attempt}
            selectedRegionId={selectedRegionId}
            actions={regionActionsOf(props, gestures.wasDragged, lastClick.read)}
            overlay={props.editing?.overlay}
            onImageError={() => setFailedAttempt(attempt)}
          />
          <FrameMapButton onClick={() => frameMap(frame, view, image)} />
        </>
      )}
    </div>
  );
}

// Remembered in the capture phase: the region's own click, which reads it, comes before the frame's.
function useLastClickPoint(
  image: Size,
  camera: Camera | null,
): Readonly<{ remember: (event: MouseEvent<HTMLElement>) => void; read: () => MapPoint | null }> {
  const point = useRef<MapPoint | null>(null);
  return {
    remember: (event) => {
      point.current = camera ? clickedMapPoint(event, { image, camera }) : null;
    },
    read: () => point.current,
  };
}

function letGoOfSelection(event: MouseEvent<HTMLElement>, view: StoreApi<MapViewState>): void {
  const clicked = event.target as Element;
  if (!clicked.closest('[data-region-id], button')) view.getState().selectRegion(null);
}

function giveMapPoint(
  event: MouseEvent<HTMLElement>,
  onMapPoint: NonNullable<MapCanvasEditing['onMapPoint']>,
  { image, camera }: Readonly<{ image: Size; camera: Camera | null }>,
): void {
  if (!camera || (event.target as Element).closest('button')) return;
  onMapPoint(clickedMapPoint(event, { image, camera }), { image, camera });
}

function clickedMapPoint(
  event: MouseEvent<HTMLElement>,
  { image, camera }: MapCanvasScene,
): MapPoint {
  const box = event.currentTarget.getBoundingClientRect();
  return screenToMapPoint(camera, image, {
    x: event.clientX - box.left,
    y: event.clientY - box.top,
  });
}

type RegionActions = Readonly<{
  click: (region: MapRegionDto) => void;
  doubleClick: (region: MapRegionDto) => void;
  enterKey: (region: MapRegionDto) => void;
  spaceKey: (region: MapRegionDto) => void;
}>;

// The keys skip `wasDragged`: it speaks of the last press, and a key is no press.
function regionActionsOf(
  { onSelectRegion, onOpenRegion: open, editing }: MapCanvasProps,
  wasDragged: () => boolean,
  clickedAt: () => MapPoint | null,
): RegionActions {
  const select = editing?.onMapPoint ? undefined : onSelectRegion;
  return {
    click: (region) => {
      if (!wasDragged()) select?.(region, clickedAt());
    },
    doubleClick: (region) => {
      if (!wasDragged()) open?.(region);
    },
    enterKey: (region) => {
      if (region.link?.state === 'open' && open) open(region);
      else select?.(region, null);
    },
    spaceKey: (region) => select?.(region, null),
  };
}

type MapLayersProps = Readonly<{
  map: LibraryMapDetailDto;
  image: Size;
  camera: Camera | null;
  attempt: number;
  selectedRegionId: string | null;
  actions: RegionActions;
  overlay?: MapCanvasEditing['overlay'];
  onImageError: () => void;
}>;

// The image is an HTML element under an SVG that is not scaled itself: strokes keep their width
// only for a transform inside the SVG, and `non-scaling-stroke` ignores one on an ancestor.
function MapLayers(props: MapLayersProps): React.JSX.Element {
  const { map, image, camera, attempt, actions } = props;
  const regions = useMemo(() => regionsPaintOrder(map.regions), [map.regions]);
  const shown = camera ?? UNFRAMED;
  return (
    <div className={camera ? undefined : 'invisible'}>
      <img
        key={attempt}
        src={`${assetUrlOf(map.asset.id)}${attempt ? `?retry=${attempt}` : ''}`}
        alt={map.name}
        draggable={false}
        onError={props.onImageError}
        className="absolute top-0 left-0 max-w-none origin-top-left"
        style={{ ...image, transform: cssTransformOf(shown) }}
      />
      <svg role="group" aria-label="Regiões do mapa" className="absolute inset-0 size-full">
        <g transform={svgTransformOf(shown)}>
          {regions.map((region) => (
            <MapRegionShape
              key={region.id}
              region={region}
              image={image}
              zoom={shown.zoom}
              selected={region.id === props.selectedRegionId}
              onClick={() => actions.click(region)}
              onDoubleClick={() => actions.doubleClick(region)}
              onEnterKey={() => actions.enterKey(region)}
              onSpaceKey={() => actions.spaceKey(region)}
            />
          ))}
          {props.overlay?.({ image, camera: shown })}
        </g>
      </svg>
    </div>
  );
}

function cssTransformOf({ offsetX, offsetY, zoom }: Camera): string {
  return `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`;
}

function svgTransformOf({ offsetX, offsetY, zoom }: Camera): string {
  return `matrix(${zoom} 0 0 ${zoom} ${offsetX} ${offsetY})`;
}

function frameMap(
  frame: RefObject<HTMLElement | null>,
  view: StoreApi<MapViewState>,
  image: Size,
): void {
  if (frame.current) view.getState().setCamera(fitMap(image, sizeOfElement(frame.current)));
}

// Before the paint, so a map never flashes at its natural size; a frame with no size yet (parked
// out of the layout) cannot be fitted to.
function useFrameOnArrival(
  frame: RefObject<HTMLElement | null>,
  view: StoreApi<MapViewState>,
  image: Size,
  camera: Camera | null,
): void {
  useLayoutEffect(() => {
    const element = frame.current;
    if (camera || !element?.clientWidth || !element.clientHeight) return;
    frameMap(frame, view, image);
  }, [camera, frame, view, image]);
}

// After the framing of the arrival, which it builds on. A frame with no size (parked out of the
// layout) keeps the request waiting: centering in it would throw the map far away.
function useLandFocus(
  frame: RefObject<HTMLElement | null>,
  view: StoreApi<MapViewState>,
  map: LibraryMapDetailDto,
  image: Size,
): void {
  const focusRegionId = useMapView(view, (state) => state.focusRegionId);
  const camera = useMapView(view, (state) => state.camera);
  useLayoutEffect(() => {
    const element = frame.current;
    if (!focusRegionId || !camera || !element?.clientWidth) return;
    const region = map.regions.find(({ id }) => id === focusRegionId);
    if (!region) return view.getState().landFocus(null);
    const point = regionFocusPoint(region.geometry);
    view.getState().landFocus(focusMapOn(camera, point, image, sizeOfElement(element)));
  }, [focusRegionId, camera, frame, view, map, image]);
}

function FrameMapButton({ onClick }: Readonly<{ onClick: () => void }>): React.JSX.Element {
  return (
    <Button
      size="sm"
      variant="outline"
      className="absolute top-3 right-3"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onClick}
    >
      Enquadrar mapa
    </Button>
  );
}

function MapImageFailed({ onRetry }: Readonly<{ onRetry: () => void }>): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <p role="alert">Não deu para carregar a imagem do mapa.</p>
      <Button onClick={onRetry}>Tentar de novo</Button>
    </div>
  );
}
