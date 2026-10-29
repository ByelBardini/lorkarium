import { createContext, useContext } from 'react';

/** What a media query is asked of: the browser window, or the chat's own window. */
export type MediaQueryView = Readonly<{ matchMedia?: (query: string) => MediaQueryList }>;

/** The other window a subtree is drawn into (the chat's own window): the element its Radix
 *  portals mount in and the window its media queries look at. */
export type PortalWindow = Readonly<{ container: HTMLElement; view: MediaQueryView }>;

/** `null` = the main window: Radix portals fall back to its `document.body`. */
export const PortalWindowContext = createContext<PortalWindow | null>(null);

/** Where a Radix portal mounts: the other window's body inside a `ChatWindowPortal`, otherwise
 *  `undefined` (Radix's own default, the main `document.body`).
 *
 *  Example: `<PopoverPrimitive.Portal container={usePortalContainer()}>` */
export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalWindowContext)?.container;
}

/** The window whose viewport a media query reads: the other window inside a `ChatWindowPortal`,
 *  otherwise the browser's.
 *
 *  Example: `useMediaQueryView().matchMedia?.('(min-width: 48rem)')` */
export function useMediaQueryView(): MediaQueryView {
  return useContext(PortalWindowContext)?.view ?? window;
}
