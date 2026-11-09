import { useEffect, useMemo } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { LibraryMapsApi } from '@/services/library-maps-api';
import {
  createMapDrawingFlow,
  useMapDrawingFlow,
  type MapDrawingFlow,
} from '@/stores/map-drawing-flow';
import type { MapViewState } from '@/stores/map-view-store';

export type MapDrawingOptions = Readonly<{
  api: Pick<LibraryMapsApi, 'createRegion' | 'updateRegion'>;
  view: StoreApi<MapViewState>;
  campaignId: string;
  mapId: string;
  /** The editor is open and connected: only then the keys and the hand count. */
  active: boolean;
}>;

/** The drawing of a map's editor: one per map, its answers written on the view, with Enter and Esc
 *  while something is in hand.
 *
 *  Example: `const flow = useMapDrawing({ api, view, campaignId, mapId, active: editing && live })` */
export function useMapDrawing(options: MapDrawingOptions): StoreApi<MapDrawingFlow> {
  const { api, view, campaignId, mapId, active } = options;
  const flow = useMemo(
    () =>
      createMapDrawingFlow({
        api,
        campaignId,
        mapId,
        onRegionCreated: (region) => {
          view.getState().applyRegion(mapId, region);
          if (view.getState().mapId === mapId) view.getState().selectRegion(region.id);
        },
        onRegionMoved: (region) => view.getState().applyRegion(mapId, region),
      }),
    [api, view, campaignId, mapId],
  );
  useLostHandle(flow, active);
  useDrawingKeys(flow, active);
  return flow;
}

// A handle held when the connection falls can no longer be let go: its element is gone.
function useLostHandle(flow: StoreApi<MapDrawingFlow>, active: boolean): void {
  useEffect(() => {
    if (!active) flow.getState().dropHandle();
  }, [flow, active]);
}

function useDrawingKeys(flow: StoreApi<MapDrawingFlow>, active: boolean): void {
  const inHand = useMapDrawingFlow(flow, (state) => state.tool !== null || state.grabbed);
  const listening = active && inHand;
  useEffect(() => {
    if (!listening) return;
    const onKey = (event: KeyboardEvent): void => answerDrawingKey(event, flow.getState());
    // By capture: the focus may be on a tool or a region, which would answer the same key too.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [flow, listening]);
}

function answerDrawingKey(event: KeyboardEvent, drawing: MapDrawingFlow): void {
  if (event.key !== 'Enter' && event.key !== 'Escape') return;
  if (isFieldToTypeIn(event.target)) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'Enter') drawing.finishPolygon();
  else drawing.stepBack();
}

function isFieldToTypeIn(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches('input, textarea, [contenteditable]');
}
