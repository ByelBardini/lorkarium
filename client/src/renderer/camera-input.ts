import type { Point } from './camera';

/** The part of a `WheelEvent` the mapping reads (`x`/`y` relative to the board). */
export type WheelInput = Readonly<{
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  x: number;
  y: number;
}>;

export type WheelIntent =
  | Readonly<{ kind: 'pan'; dx: number; dy: number }>
  | Readonly<{ kind: 'zoom'; factor: number; at: Point }>;

export type PanKey = 'w' | 'a' | 's' | 'd';

export type CameraKeyAction = 'zoom-in' | 'zoom-out' | 'fit';

export type CameraKeyPress = Readonly<{
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}>;

/** Screen px per second while W, A, S or D is held. */
export const KEYBOARD_PAN_SPEED = 600;

const LINE_HEIGHT_PX = 16;
const PAGE_HEIGHT_PX = 800;
// 100 px of wheel (one notch) is about ×0.82; a trackpad pinch sends small deltas, so it is smooth.
const WHEEL_ZOOM_SENSITIVITY = 500;
// Past this a right button press is a drag, not a click that opens the context menu.
const RIGHT_DRAG_THRESHOLD_PX = 4;

/** Wheel → camera intent: the wheel pans (Shift: sideways), Ctrl/⌘ + wheel and trackpad pinch
 *  (which the browser sends as a wheel with `ctrlKey`) zoom at the cursor.
 *
 *  Example: `const intent = wheelIntent({ ...event, x: event.offsetX, y: event.offsetY })` */
export function wheelIntent(input: WheelInput): WheelIntent {
  const scale = deltaScaleOf(input.deltaMode);
  const deltaX = input.deltaX * scale;
  const deltaY = input.deltaY * scale;
  if (input.ctrlKey || input.metaKey) {
    return { kind: 'zoom', factor: Math.exp(-deltaY / WHEEL_ZOOM_SENSITIVITY), at: input };
  }
  if (input.shiftKey && deltaX === 0) return { kind: 'pan', dx: -deltaY, dy: 0 };
  return { kind: 'pan', dx: -deltaX, dy: -deltaY };
}

/** Example: `panKeyOf(event.key) // 'w' for W or w` */
export function panKeyOf(key: string): PanKey | null {
  const lower = key.toLowerCase();
  return lower === 'w' || lower === 'a' || lower === 's' || lower === 'd' ? lower : null;
}

/** How far the view moves after `elapsedMs` with these keys held; diagonals keep the speed.
 *
 *  Example: `panBy(camera, ...Object.values(keyboardPan(held, ticker.deltaMS)))` */
export function keyboardPan(
  held: ReadonlySet<PanKey>,
  elapsedMs: number,
): Readonly<{ dx: number; dy: number }> {
  const x = (held.has('a') ? 1 : 0) - (held.has('d') ? 1 : 0);
  const y = (held.has('w') ? 1 : 0) - (held.has('s') ? 1 : 0);
  const length = Math.hypot(x, y);
  if (length === 0) return { dx: 0, dy: 0 };
  const distance = (KEYBOARD_PAN_SPEED * elapsedMs) / 1000;
  return { dx: (x / length) * distance, dy: (y / length) * distance };
}

/** + and = zoom in, - zooms out, 0 frames the scene; with Ctrl/⌘/Alt it is the browser's.
 *
 *  Example: `cameraKeyAction(event) // 'fit' for 0` */
export function cameraKeyAction(press: CameraKeyPress): CameraKeyAction | null {
  if (press.ctrlKey || press.metaKey || press.altKey) return null;
  if (press.key === '+' || press.key === '=') return 'zoom-in';
  if (press.key === '-') return 'zoom-out';
  return press.key === '0' ? 'fit' : null;
}

export type RightDrag = Readonly<{ start: Point; last: Point; panning: boolean }>;

/** Example: `drag = startRightDrag({ x: event.offsetX, y: event.offsetY })` */
export function startRightDrag(at: Point): RightDrag {
  return { start: at, last: at, panning: false };
}

/** The drag after the pointer moved to `at`, and the pan it causes (none under 4 px).
 *
 *  Example: `const { drag, pan } = moveRightDrag(drag, point); if (pan) camera = panBy(camera, pan.dx, pan.dy)` */
export function moveRightDrag(
  drag: RightDrag,
  at: Point,
): Readonly<{ drag: RightDrag; pan: Readonly<{ dx: number; dy: number }> | null }> {
  const travelled = Math.hypot(at.x - drag.start.x, at.y - drag.start.y);
  if (!drag.panning && travelled < RIGHT_DRAG_THRESHOLD_PX) return { drag, pan: null };
  const pan = { dx: at.x - drag.last.x, dy: at.y - drag.last.y };
  return { drag: { ...drag, last: at, panning: true }, pan };
}

/** `context` when the button barely moved (let the context menu open), `pan-end` otherwise.
 *
 *  Example: `if (endRightDrag(drag) === 'pan-end') event.preventDefault()` */
export function endRightDrag(drag: RightDrag): 'context' | 'pan-end' {
  return drag.panning ? 'pan-end' : 'context';
}

function deltaScaleOf(deltaMode: number): number {
  if (deltaMode === 1) return LINE_HEIGHT_PX;
  return deltaMode === 2 ? PAGE_HEIGHT_PX : 1;
}
