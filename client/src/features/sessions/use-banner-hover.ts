import { useState } from 'react';

export type BannerHover = Readonly<{
  /** Whether the banner may move now: the pointer is over the row and motion is welcome. */
  moving: boolean;
  /** Spread on the row. */
  rowHandlers: Readonly<{ onPointerEnter: () => void; onPointerLeave: () => void }>;
}>;

/** The hover of a "Na mesa" row that wakes its banner: spread `rowHandlers` on the row and hand
 *  `moving` to `MemberBannerBackdrop`. Asking for less motion keeps the banner still.
 *
 *  Example: `const hover = useBannerHover(); <li {...hover.rowHandlers}>` */
export function useBannerHover(): BannerHover {
  const [moving, setMoving] = useState(false);
  const rowHandlers = {
    onPointerEnter: () => setMoving(!prefersReducedMotion()),
    onPointerLeave: () => setMoving(false),
  };
  return { moving, rowHandlers };
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
