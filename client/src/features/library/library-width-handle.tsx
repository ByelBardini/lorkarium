import { useRef, type RefObject } from 'react';
import {
  LIBRARY_DRAWER_MAX_WIDTH,
  LIBRARY_DRAWER_MIN_WIDTH,
  clampLibraryDrawerWidth,
} from '@/lib/library-drawer-width';
import type { LibraryDrawerWidth } from './use-library-drawer-width';

const KEY_STEP = 16;

type LibraryWidthHandleProps = LibraryDrawerWidth &
  Readonly<{ drawer: RefObject<HTMLElement | null> }>;

/** The drawer's right edge: drag it, or focus it and use ← →, to change the width.
 *
 *  Example: `<LibraryWidthHandle drawer={drawerRef} {...sizing} />` */
export function LibraryWidthHandle({ drawer, width, onWidth }: LibraryWidthHandleProps) {
  const dragging = useRef(false);
  const widthAt = (clientX: number): number => {
    const box = drawer.current;
    const left = box?.getBoundingClientRect().left ?? 0;
    return clampLibraryDrawerWidth(clientX - left, roomWidthOf(box));
  };
  const step = (delta: number): void =>
    onWidth(clampLibraryDrawerWidth(width + delta, roomWidthOf(drawer.current)), true);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Largura da biblioteca"
      aria-valuenow={width}
      aria-valuemin={LIBRARY_DRAWER_MIN_WIDTH}
      aria-valuemax={LIBRARY_DRAWER_MAX_WIDTH}
      tabIndex={0}
      className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none outline-none hover:bg-primary/40 focus-visible:bg-primary/60 max-md:hidden"
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => dragging.current && onWidth(widthAt(event.clientX), false)}
      onPointerUp={(event) => {
        if (!dragging.current) return;
        dragging.current = false;
        onWidth(widthAt(event.clientX), true);
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') step(KEY_STEP);
        if (event.key === 'ArrowLeft') step(-KEY_STEP);
      }}
    />
  );
}

// The slot the drawer floats in (the board minus the toolbar and the panel); jsdom and a slot not
// laid out yet measure 0, so the window stands in.
function roomWidthOf(drawer: HTMLElement | null): number {
  return drawer?.parentElement?.clientWidth || window.innerWidth;
}
