/** The part of a pointer event a drag reads. */
export type DragPoint = Readonly<{ clientX: number; clientY: number }>;

/** Follows the pointer from a `pointerdown` on `handle` until it is let go: the pointer is
 *  captured, so an iframe under it (a sheet's frame) never takes the drag. Only the main button
 *  starts it; `false` when it did not start.
 *
 *  Example: `trackPointerDrag(handle, event, (moved) => setWidth(moved.clientX), remember)` */
export function trackPointerDrag(
  handle: HTMLElement,
  start: Readonly<{ button: number; pointerId: number }>,
  onMove: (moved: DragPoint) => void,
  onEnd: () => void,
): boolean {
  if (start.button !== 0) return false;
  handle.setPointerCapture?.(start.pointerId);
  const end = (): void => {
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', end);
    handle.removeEventListener('pointercancel', end);
    onEnd();
  };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  return true;
}
