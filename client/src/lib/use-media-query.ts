import { useSyncExternalStore } from 'react';

/** Tailwind `md` and up: tablet and desktop get the full room, a phone gets the board alone. */
export const DESKTOP_QUERY = '(min-width: 48rem)';

/** Whether the viewport matches `query`, following resizes. Without `matchMedia` (jsdom, very old
 *  browsers) it answers `true`: the desktop layout is the one that always works.
 *
 *  Example: `const desktop = useMediaQuery(DESKTOP_QUERY)` */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = mediaQueryListOf(query);
      list?.addEventListener('change', onChange);
      return () => list?.removeEventListener('change', onChange);
    },
    () => mediaQueryListOf(query)?.matches ?? true,
  );
}

function mediaQueryListOf(query: string): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;
}
