import { useEffect, useRef, type PointerEvent, type RefObject } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { panMap, zoomMapAt } from '@/lib/map-viewport';
import type { Camera, Size } from '@/renderer/camera';
import {
  moveRightDrag,
  startRightDrag,
  wheelIntent,
  type RightDrag,
  type WheelInput,
} from '@/renderer/camera-input';
import type { MapViewState } from '@/stores/map-view-store';

export type MapFrameHandlers = Readonly<{
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
}>;

export type MapGestures = Readonly<{
  /** To spread on the map's frame. */
  frameHandlers: MapFrameHandlers;
  /** The press that just ended moved the map: the click it ends in opens nothing. */
  wasDragged: () => boolean;
}>;

type HeldPointer = Readonly<{ pointerId: number; drag: RightDrag }>;
type MapPress = { held: HeldPointer | null; dragged: boolean };
type PanBy = Readonly<{ dx: number; dy: number }>;
type FrameRef = RefObject<HTMLElement | null>;
type MapView = StoreApi<MapViewState>;

/** Pan by dragging and the board's wheel over a map's frame (the wheel pans, Ctrl or a pinch
 *  zooms at the cursor). The camera is read from the view at each event, so a burst of them
 *  in one frame adds up.
 *
 *  Example: `const gestures = useMapGestures(frame, view, image)` */
export function useMapGestures(frame: FrameRef, view: MapView, image: Size): MapGestures {
  const press = useRef<MapPress>({ held: null, dragged: false });
  useMapWheel(frame, view, image);
  const pan = (by: PanBy): void =>
    moveCamera(frame, view, (camera, viewport) => panMap(camera, by, image, viewport));
  const letGo = (): void => {
    press.current.held = null;
  };
  return {
    frameHandlers: {
      onPointerDown: (event) => startMapPress(press.current, event),
      onPointerMove: (event) => followMapPress(press.current, event, pan),
      onPointerUp: letGo,
      onPointerCancel: letGo,
    },
    wasDragged: () => press.current.dragged,
  };
}

function startMapPress(press: MapPress, event: PointerEvent<HTMLElement>): void {
  if (event.button !== 0) return;
  press.dragged = false;
  press.held = { pointerId: event.pointerId, drag: startRightDrag(clientPointOf(event)) };
}

function followMapPress(
  press: MapPress,
  event: PointerEvent<HTMLElement>,
  pan: (by: PanBy) => void,
): void {
  if (press.held?.pointerId !== event.pointerId) return;
  const { drag, pan: by } = moveRightDrag(press.held.drag, clientPointOf(event));
  press.held = { ...press.held, drag };
  if (!by) return;
  // Only from here: a captured press would take the click away from the region under it.
  if (!press.dragged) event.currentTarget.setPointerCapture?.(event.pointerId);
  press.dragged = true;
  pan(by);
}

function clientPointOf(event: PointerEvent<HTMLElement>): Readonly<{ x: number; y: number }> {
  return { x: event.clientX, y: event.clientY };
}

// A native listener: React's `onWheel` is passive, and only `preventDefault` stops Ctrl + wheel
// from zooming the whole page.
function useMapWheel(frame: FrameRef, view: MapView, image: Size): void {
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      turnWheel(frame, view, image, wheelInputOf(event, element));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [frame, view, image]);
}

function turnWheel(frame: FrameRef, view: MapView, image: Size, input: WheelInput): void {
  const intent = wheelIntent(input);
  moveCamera(frame, view, (camera, viewport) =>
    intent.kind === 'zoom'
      ? zoomMapAt(camera, intent.factor, intent.at, image, viewport)
      : panMap(camera, intent, image, viewport),
  );
}

function wheelInputOf(event: WheelEvent, frame: HTMLElement): WheelInput {
  const box = frame.getBoundingClientRect();
  const { deltaX, deltaY, deltaMode, ctrlKey, metaKey, shiftKey } = event;
  return {
    deltaX,
    deltaY,
    deltaMode,
    ctrlKey,
    metaKey,
    shiftKey,
    x: event.clientX - box.left,
    y: event.clientY - box.top,
  };
}

function moveCamera(
  frame: FrameRef,
  view: MapView,
  next: (camera: Camera, viewport: Size) => Camera,
): void {
  const { camera, setCamera } = view.getState();
  if (!camera || !frame.current) return;
  setCamera(next(camera, sizeOfElement(frame.current)));
}

/** The inner size of an element, as the map's viewport.
 *
 *  Example: `fitMap(image, sizeOfElement(frame))` */
export function sizeOfElement(element: HTMLElement): Size {
  return { width: element.clientWidth, height: element.clientHeight };
}
