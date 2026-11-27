import { screenToWorld, type Camera, type Point } from '@/renderer/camera';

/** The type a saved token travels under while dragged from the panel to the board: no other drag
 *  (an image, a library item) carries it, so the board takes only these. */
export const SAVED_TOKEN_DRAG_TYPE = 'application/x-lorkarium-saved-token';

type DragData = Pick<DataTransfer, 'types' | 'getData'>;

/** Whether a drag over the board carries a saved token (its id is only readable on the drop).
 *
 *  Example: `if (carriesSavedToken(event.dataTransfer)) event.preventDefault()` */
export function carriesSavedToken(data: Pick<DataTransfer, 'types'>): boolean {
  return Array.from(data.types).includes(SAVED_TOKEN_DRAG_TYPE);
}

/** The id of the saved token dropped, or `null` for any other drop.
 *
 *  Example: `savedTokenIdOf(event.dataTransfer) // 'c0ffee…'` */
export function savedTokenIdOf(data: DragData): string | null {
  if (!carriesSavedToken(data)) return null;
  return data.getData(SAVED_TOKEN_DRAG_TYPE) || null;
}

/** Where a drop at `client` (viewport px) lands on the board whose host starts at `origin`: the
 *  world point under it through the camera.
 *
 *  Example: `dropWorldOf(renderer.camera(), host.getBoundingClientRect(), { x: event.clientX, y: event.clientY })` */
export function dropWorldOf(
  camera: Camera,
  origin: Readonly<{ left: number; top: number }>,
  client: Point,
): Point {
  return screenToWorld(camera, { x: client.x - origin.left, y: client.y - origin.top });
}
