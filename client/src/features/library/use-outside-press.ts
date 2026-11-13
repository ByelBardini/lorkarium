import { useEffect, useRef, type RefObject } from 'react';

/** Marks the control that already toggles the library (the tabs strip's "Biblioteca"): a press
 *  on it is no press outside, or it would close and reopen the drawer. */
export const LIBRARY_TOGGLE_ATTRIBUTE = 'data-library-toggle';

// What the drawer opened in a portal (a menu, the filters popover, "Novo item", a confirmation,
// the image viewer) sits outside its box but is still the drawer's.
const OPENED_FROM_DRAWER =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]';

/** Calls `onOutside` on a pointer press outside `box`, unless it lands on the library toggle or
 *  while something opened from the drawer is up. The press still reaches its target: no
 *  overlay, nothing stopped.
 *
 *  Example: `useOutsidePress(drawer, close)` */
export function useOutsidePress(box: RefObject<HTMLElement | null>, onOutside: () => void): void {
  const latest = useRef(onOutside);
  useEffect(() => {
    latest.current = onOutside;
  });
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      if (isInsidePress(box.current, event.target)) return;
      latest.current();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [box]);
}

function isInsidePress(box: HTMLElement | null, target: EventTarget | null): boolean {
  if (!box || !(target instanceof Node)) return true;
  if (box.contains(target)) return true;
  if (target instanceof Element && target.closest(`[${LIBRARY_TOGGLE_ATTRIBUTE}]`)) return true;
  return document.querySelector(OPENED_FROM_DRAWER) !== null;
}
