import type { MapRegionDto } from '@lorkarium/contracts';
import type { MapPoint } from '@lorkarium/game-core';
import type { KeyboardEvent } from 'react';
import { legibleInkOn } from '@/lib/color-contrast';
import { mapPinMarker, mapPolygonPoints } from '@/lib/map-viewport';
import type { Size } from '@/renderer/camera';
import { MAP_PIN_ICON_CHOICES } from './map-pin-icons';

const FILL_OPACITY = 0.28;
const HIDDEN_FILL_OPACITY = 0.1;
// Stronger than a hidden polygon's: a pin is small, and the master still has to find it.
const HIDDEN_PIN_OPACITY = 0.5;
// White over any map: the color of the region alone sinks into a busy image.
const PIN_RING_COLOR = '#ffffff';
const STROKE_WIDTH_PX = 2;
const SELECTED_STROKE_WIDTH_PX = 4;

export type MapRegionShapeProps = Readonly<{
  region: MapRegionDto;
  image: Size;
  zoom: number;
  selected?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  /** Enter: what a double click does. */
  onEnterKey?: () => void;
  /** Space: what a click does. */
  onSpaceKey?: () => void;
}>;

/** One region of a map as SVG, in the image's pixels: a polygon or a pin, in the region's color;
 *  a hidden one (only masters receive it) is drawn fainter and dashed. A button for the keyboard
 *  and for a screen reader.
 *
 *  Example: `<MapRegionShape region={region} image={image} zoom={camera.zoom} onClick={open} />` */
export function MapRegionShape(props: MapRegionShapeProps): React.JSX.Element {
  const { region, selected } = props;
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={region.hidden ? `${region.name} (oculta)` : region.name}
      data-region-id={region.id}
      data-hidden={region.hidden || undefined}
      data-selected={selected || undefined}
      className="cursor-pointer outline-none focus-visible:[stroke-width:4]"
      fill={region.color}
      fillOpacity={region.hidden ? HIDDEN_FILL_OPACITY : FILL_OPACITY}
      stroke={region.color}
      strokeWidth={selected ? SELECTED_STROKE_WIDTH_PX : STROKE_WIDTH_PX}
      strokeDasharray={region.hidden ? '6 4' : undefined}
      onClick={props.onClick}
      onDoubleClick={props.onDoubleClick}
      onKeyDown={(event) => answerRegionKey(event, props)}
    >
      <title>{region.name}</title>
      <RegionGeometry {...props} />
    </g>
  );
}

function answerRegionKey(event: KeyboardEvent, props: MapRegionShapeProps): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  // Space would also scroll whatever scrolls around the map.
  event.preventDefault();
  if (event.key === 'Enter') props.onEnterKey?.();
  else props.onSpaceKey?.();
}

function RegionGeometry({ region, image, zoom }: MapRegionShapeProps): React.JSX.Element {
  const { geometry } = region;
  if (geometry.shape === 'polygon') {
    return (
      <polygon
        points={mapPolygonPoints(geometry.points, image)}
        vectorEffect="non-scaling-stroke"
      />
    );
  }
  return <PinMarker region={region} point={geometry.point} image={image} zoom={zoom} />;
}

function PinMarker({
  region,
  point,
  image,
  zoom,
}: Readonly<{
  region: MapRegionDto;
  point: MapPoint;
  image: Size;
  zoom: number;
}>): React.JSX.Element {
  const { cx, cy, r, hitRadius, iconSize } = mapPinMarker(point, image, zoom);
  const { Icon } = MAP_PIN_ICON_CHOICES[region.icon];
  return (
    <>
      <circle cx={cx} cy={cy} r={hitRadius} fill="transparent" stroke="none" />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fillOpacity={region.hidden ? HIDDEN_PIN_OPACITY : 1}
        stroke={PIN_RING_COLOR}
        vectorEffect="non-scaling-stroke"
      />
      <g data-pin-icon={region.icon}>
        <Icon
          x={cx - iconSize / 2}
          y={cy - iconSize / 2}
          width={iconSize}
          height={iconSize}
          color={legibleInkOn(region.color)}
          strokeDasharray="none"
          aria-hidden="true"
        />
      </g>
    </>
  );
}
