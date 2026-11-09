import type { MapRegionDto } from '@lorkarium/contracts';
import { regionFocusPoint } from '@lorkarium/game-core';
import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { mapCardPosition, mapPointToScreen } from '@/lib/map-viewport';
import type { Size } from '@/renderer/camera';
import { useMapView, type MapViewState } from '@/stores/map-view-store';
import { sizeOfElement } from './use-map-gestures';

/** Handed to `MapRegionCard`: `style` is absent until the card could be measured. */
export type MapCardPlacement = Readonly<{
  ref: RefObject<HTMLElement | null>;
  style?: CSSProperties;
}>;

type MapCardRoom = Readonly<{ card: Size; frame: Size }>;

/** Keeps the card of a region beside the spot that was clicked (or beside the region, when no click
 *  chose it), following the map as it is dragged or zoomed.
 *
 *  Example: `<MapRegionCard placement={useMapCardPlacement(view, map.asset, selected)} … />` */
export function useMapCardPlacement(
  view: StoreApi<MapViewState>,
  image: Size,
  region: MapRegionDto | null,
): MapCardPlacement {
  const camera = useMapView(view, (state) => state.camera);
  const anchor = useMapView(view, (state) => state.selectedAnchor);
  const ref = useRef<HTMLElement>(null);
  const room = useMeasuredRoom(ref, region);
  if (!camera || !room || !region) return { ref };
  const spot = mapPointToScreen(camera, image, anchor ?? regionFocusPoint(region.geometry));
  const { x, y } = mapCardPosition(spot, room.card, room.frame);
  return { ref, style: { left: x, top: y } };
}

// Before the paint, so it never blinks at the corner, and again when the region changes: what the
// card says sets its height. Not at every pan: that would force a layout per frame of the drag.
function useMeasuredRoom(
  ref: RefObject<HTMLElement | null>,
  region: MapRegionDto | null,
): MapCardRoom | null {
  const [room, setRoom] = useState<MapCardRoom | null>(null);
  useLayoutEffect(() => {
    const card = ref.current;
    if (!card?.parentElement) return;
    const measured = {
      card: { width: card.offsetWidth, height: card.offsetHeight },
      frame: sizeOfElement(card.parentElement),
    };
    setRoom((known) => (sameRoom(known, measured) ? known : measured));
  }, [ref, region]);
  return room;
}

function sameRoom(a: MapCardRoom | null, b: MapCardRoom): boolean {
  return (
    a?.card.width === b.card.width &&
    a.card.height === b.card.height &&
    a.frame.width === b.frame.width &&
    a.frame.height === b.frame.height
  );
}
