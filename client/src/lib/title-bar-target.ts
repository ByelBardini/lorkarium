/** Wraps a Radix `onPointerDownOutside` so a press on the desktop title bar (minimize, drag)
 *  leaves the dialog open, as a native window's caption does.
 *
 *  Example: `<DialogPrimitive.Content onPointerDownOutside={keepOpenOnTitleBar(onPointerDownOutside)} />` */
export function keepOpenOnTitleBar<E extends Event>(
  handler?: (event: E) => void,
): (event: E) => void {
  return (event) => {
    if (isInsideTitleBar(event.target)) event.preventDefault();
    handler?.(event);
  };
}

function isInsideTitleBar(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-title-bar]') !== null;
}
