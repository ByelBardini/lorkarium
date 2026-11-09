import type { MapPoint } from '@lorkarium/game-core';
import { mapPinCircle, mapPolygonPoints } from '@/lib/map-viewport';
import { MAP_REGION_DEFAULT_COLOR } from '@/stores/map-drawing-flow';
import type { MapCanvasScene } from './map-canvas';

export type MapDrawingDraftProps = Readonly<{
  vertices: readonly MapPoint[];
  scene: MapCanvasScene;
}>;

/** The polygon being drawn: dashed, not yet a region. Takes no pointer, so the click on the first
 *  vertex reaches the map like any other.
 *
 *  Example: `<MapDrawingDraft vertices={vertices} scene={scene} />` */
export function MapDrawingDraft({ vertices, scene }: MapDrawingDraftProps): React.JSX.Element {
  const { image, camera } = scene;
  return (
    <g pointerEvents="none" stroke={MAP_REGION_DEFAULT_COLOR} fill={MAP_REGION_DEFAULT_COLOR}>
      <polyline
        points={mapPolygonPoints(vertices, image)}
        fill="none"
        strokeWidth={2}
        strokeDasharray="6 4"
        vectorEffect="non-scaling-stroke"
      />
      {vertices.map((point, at) => (
        <circle
          key={`${at}-${point.x}-${point.y}`}
          data-map-draft-vertex={at}
          {...mapPinCircle(point, image, camera.zoom)}
        />
      ))}
    </g>
  );
}
