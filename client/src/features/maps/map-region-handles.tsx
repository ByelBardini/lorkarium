import type { MapRegionDto } from '@lorkarium/contracts';
import type { MapPoint, MapRegionGeometry } from '@lorkarium/game-core';
import type { PointerEvent } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { mapPinCircle, screenToMapPoint } from '@/lib/map-viewport';
import type { MapDrawingFlow } from '@/stores/map-drawing-flow';
import type { MapCanvasScene } from './map-canvas';

export type MapRegionHandlesProps = Readonly<{
  region: MapRegionDto;
  scene: MapCanvasScene;
  flow: StoreApi<MapDrawingFlow>;
}>;

/** The grips of the selected region: one per vertex, or the pin itself, of constant size on
 *  screen. Letting one go sends the new shape.
 *
 *  Example: `<MapRegionHandles region={selected} scene={scene} flow={flow} />` */
export function MapRegionHandles({
  region,
  scene,
  flow,
}: MapRegionHandlesProps): React.JSX.Element {
  return (
    <g>
      {pointsOf(region.geometry).map((point, vertex) => (
        // By position: the element must survive the move, or the pointer capture goes with it.
        <RegionHandle
          key={vertex}
          point={point}
          vertex={vertex}
          region={region}
          scene={scene}
          flow={flow}
        />
      ))}
    </g>
  );
}

function pointsOf(geometry: MapRegionGeometry): readonly MapPoint[] {
  return geometry.shape === 'pin' ? [geometry.point] : geometry.points;
}

type RegionHandleProps = MapRegionHandlesProps & Readonly<{ point: MapPoint; vertex: number }>;

function RegionHandle(props: RegionHandleProps): React.JSX.Element {
  const { point, vertex, region, scene, flow } = props;
  return (
    <circle
      data-map-handle={vertex}
      {...mapPinCircle(point, scene.image, scene.camera.zoom)}
      fill="var(--background)"
      stroke={region.color}
      strokeWidth={2}
      vectorEffect="non-scaling-stroke"
      className="cursor-move touch-none"
      onPointerDown={(event) => pressHandle(event, props)}
      onPointerMove={(event) => flow.getState().dragHandle(mapPointUnder(event, scene))}
      onPointerUp={() => flow.getState().releaseHandle()}
      onPointerCancel={() => flow.getState().dropHandle()}
      // The map's frame takes a click on it as a click on nothing, and would close the place.
      onClick={(event) => event.stopPropagation()}
    />
  );
}

function pressHandle(event: PointerEvent<SVGCircleElement>, props: RegionHandleProps): void {
  if (event.button !== 0) return;
  // The frame would start moving the map.
  event.stopPropagation();
  event.currentTarget.setPointerCapture?.(event.pointerId);
  props.flow.getState().grabHandle(props.region, props.vertex);
}

function mapPointUnder(event: PointerEvent<SVGCircleElement>, scene: MapCanvasScene): MapPoint {
  const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
  const screen = { x: event.clientX - (box?.left ?? 0), y: event.clientY - (box?.top ?? 0) };
  return screenToMapPoint(scene.camera, scene.image, screen);
}
