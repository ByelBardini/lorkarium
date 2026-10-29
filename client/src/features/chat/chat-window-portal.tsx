import { type ReactNode, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { recognizeNodesOfOtherWindows } from '@/lib/cross-window-nodes';
import { mirrorStyles } from '@/lib/mirror-styles';
import { type PortalWindow, PortalWindowContext } from '@/lib/portal-window';

type ChatWindowPortalProps = Readonly<{
  /** The chat window's `document.body` (`useChatWindow(…).portalTarget`). */
  target: HTMLElement;
  children: ReactNode;
}>;

/** Draws `children` into the chat's own window, still in this React tree (same connection, same
 *  stores): copies the app's styles there and points the Radix portals and media queries of the
 *  subtree at that window.
 *
 *  Example: `{chatWindow.portalTarget && <ChatWindowPortal target={chatWindow.portalTarget}><ChatBody /></ChatWindowPortal>}` */
export function ChatWindowPortal({ target, children }: ChatWindowPortalProps) {
  const portalWindow = usePortalWindowOf(target);
  useEffect(() => recognizeNodesOfOtherWindows(window), []);
  useEffect(() => mirrorStyles(document, target.ownerDocument), [target]);
  return createPortal(
    <PortalWindowContext.Provider value={portalWindow}>{children}</PortalWindowContext.Provider>,
    target,
  );
}

function usePortalWindowOf(target: HTMLElement): PortalWindow {
  return useMemo(
    () => ({ container: target, view: target.ownerDocument.defaultView ?? window }),
    [target],
  );
}
