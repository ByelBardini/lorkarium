import { useCallback, useSyncExternalStore } from 'react';
import { type MediaQueryView, useMediaQueryView } from '@/lib/portal-window';

/** Tailwind `md` and up: tablet and desktop get the full room, a phone gets the board alone. */
export const DESKTOP_QUERY = '(min-width: 48rem)';

/** Whether the viewport matches `query`, following resizes. Without `matchMedia` (jsdom, very old
 *  browsers) it answers `true`: the desktop layout is the one that always works. Inside a
 *  `ChatWindowPortal` the viewport is the chat window's, not the main one's.
 *
 *  Example: `const desktop = useMediaQuery(DESKTOP_QUERY)` */
export function useMediaQuery(query: string): boolean {
  const view = useMediaQueryView();
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = mediaQueryListOf(view, query);
      list?.addEventListener('change', onChange);
      return () => list?.removeEventListener('change', onChange);
    },
    [view, query],
  );
  return useSyncExternalStore(subscribe, () => mediaQueryListOf(view, query)?.matches ?? true);
}

function mediaQueryListOf(view: MediaQueryView, query: string): MediaQueryList | null {
  return typeof view.matchMedia === 'function' ? view.matchMedia(query) : null;
}
