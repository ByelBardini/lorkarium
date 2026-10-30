import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import {
  CHAT_WINDOW_FEATURES,
  CHAT_WINDOW_MARK,
  CHAT_WINDOW_URL,
  IMAGE_WINDOW_URL,
  IMAGE_WINDOW_FEATURES,
  type ChatWindowHandle,
  type ChatWindowHost,
} from '@/services/chat-window-host';
import { useChatWindowTopmost, type ChatWindowTopmost } from './use-chat-window-topmost';
import { DICE_WINDOW_URL } from '@/services/chat-window-host';
import type { DesktopWindow } from '@/services/desktop-window';

/** How often the open window is checked: closed by its X, or the chat page loaded. A browser has
 *  no event for either that reaches the opener reliably (the first `about:blank` shares the
 *  `Window` with the page that replaces it). */
export const CHAT_WINDOW_POLL_MS = 250;

/** `docked` = the chat is in the room's tab; `detached` = in its own window; `blocked` = the
 *  browser refused the window, so the chat stays in the tab with a warning. */
export type ChatWindowStatus = 'docked' | 'detached' | 'blocked';

export type ChatWindow = ChatWindowTopmost &
  Readonly<{
    status: ChatWindowStatus;
    /** Opens the chat's window, or only focuses it when it is already open. */
    open: () => void;
    /** "Trazer de volta": closes the window and docks the chat in the tab. */
    bringBack: () => void;
    /** The window's `document.body` for `ChatWindowPortal`; `null` until the page loads. */
    portalTarget: HTMLElement | null;
    canAlwaysOnTop: boolean;
    desktopWindow: DesktopWindow | null;
    closeError: string | null;
  }>;

type ChatWindowState = Readonly<{
  status: ChatWindowStatus;
  target: HTMLElement | null;
  canAlwaysOnTop: boolean;
  desktopWindow: DesktopWindow | null;
  closeError: string | null;
}>;

const DOCKED: ChatWindowState = {
  status: 'docked',
  target: null,
  canAlwaysOnTop: false,
  desktopWindow: null,
  closeError: null,
};

/** The chat of one table in its own system window, mirrored from the room by a portal: the hook
 *  owns the window (open, focus, close when the room goes away) and follows its X.
 *
 *  Example: `const chatWindow = useChatWindow(campaignId, deps.chatWindowHost); chatWindow.open()` */
export function useChatWindow(
  campaignId: string,
  host: ChatWindowHost,
  panel: 'chat' | 'dice' | 'image' = 'chat',
): ChatWindow {
  const [state, setState] = useState<ChatWindowState>(DOCKED);
  const handleRef = useRef<ChatWindowHandle | null>(null);
  const { resetAlwaysOnTop, ...topmost } = useChatWindowTopmost(handleRef);
  useFollowChatWindow(handleRef, state.status === 'detached', setState);
  useCloseChatWindowOnLeave(handleRef);
  const open = useCallback(() => {
    const current = handleRef.current;
    if (current && !current.closed) return current.focus();
    resetAlwaysOnTop();
    const url =
      panel === 'image' ? IMAGE_WINDOW_URL : panel === 'dice' ? DICE_WINDOW_URL : CHAT_WINDOW_URL;
    const name =
      panel === 'chat' ? chatWindowNameOf(campaignId) : `lorkarium-${panel}-${campaignId}`;
    const opened = host.open(
      url,
      name,
      panel === 'image' ? IMAGE_WINDOW_FEATURES : CHAT_WINDOW_FEATURES,
    );
    handleRef.current = opened;
    setState({
      status: opened ? 'detached' : 'blocked',
      target: null,
      canAlwaysOnTop: !!opened?.setAlwaysOnTop,
      desktopWindow: null,
      closeError: null,
    });
  }, [campaignId, host, panel, resetAlwaysOnTop]);
  const bringBack = useCallback(() => {
    const handle = handleRef.current;
    const dock = (): void => {
      if (handleRef.current !== handle) return;
      handleRef.current = null;
      setState(DOCKED);
      resetAlwaysOnTop();
    };
    const closing = handle?.close();
    if (closing)
      void closing.then(dock, (error: unknown) =>
        setState((previous) => ({
          ...previous,
          closeError: error instanceof Error ? error.message : String(error),
        })),
      );
    else dock();
  }, [resetAlwaysOnTop]);
  return {
    ...topmost,
    alwaysOnTop: state.status === 'detached' && topmost.alwaysOnTop,
    status: state.status,
    open,
    bringBack,
    portalTarget: state.target,
    canAlwaysOnTop: state.canAlwaysOnTop,
    desktopWindow: state.desktopWindow,
    closeError: state.closeError,
  };
}

/** One window per table: opening the same table twice reuses its window. */
export function chatWindowNameOf(campaignId: string): string {
  return `lorkarium-chat-${campaignId}`;
}

function useFollowChatWindow(
  handleRef: RefObject<ChatWindowHandle | null>,
  detached: boolean,
  setState: (update: (previous: ChatWindowState) => ChatWindowState) => void,
): void {
  useEffect(() => {
    if (!detached) return;
    const startedAt = Date.now();
    let failedToLoad = false;
    const follow = (): void => {
      if (failedToLoad) return;
      const handle = handleRef.current;
      if (!handle || handle.closed) {
        handleRef.current = null;
        setState(() => DOCKED);
        return;
      }
      if (!loadedChatBodyOf(handle) && Date.now() - startedAt >= 5000) {
        failedToLoad = true;
        const closing = handle.close();
        if (closing) void closing.catch(() => undefined);
        handleRef.current = null;
        setState(() => ({ ...DOCKED, status: 'blocked' }));
        return;
      }
      setState((previous) => nextChatWindowState(previous, handle));
    };
    const timer = setInterval(follow, CHAT_WINDOW_POLL_MS);
    return () => clearInterval(timer);
  }, [handleRef, detached, setState]);
}

function nextChatWindowState(
  previous: ChatWindowState,
  handle: ChatWindowHandle | null,
): ChatWindowState {
  if (!handle) return DOCKED;
  const target = loadedChatBodyOf(handle);
  if (!target || target === previous.target) return previous;
  return {
    status: 'detached',
    target,
    canAlwaysOnTop: !!handle.setAlwaysOnTop,
    desktopWindow: handle.desktopWindow ?? null,
    closeError: null,
  };
}

function loadedChatBodyOf(handle: ChatWindowHandle): HTMLElement | null {
  try {
    const body = handle.document.body;
    return body?.hasAttribute(CHAT_WINDOW_MARK) ? body : null;
  } catch {
    return null;
  }
}

// Leaving the room unmounts the hook; a reload or closing the tab does not, so `pagehide` too.
// Either way a window left behind would be a blank page with no React behind it.
function useCloseChatWindowOnLeave(handleRef: RefObject<ChatWindowHandle | null>): void {
  useEffect(() => {
    const close = (): void => {
      const handle = handleRef.current;
      handleRef.current = null;
      const closing = handle?.close();
      if (closing) void closing.catch(() => undefined);
    };
    window.addEventListener('pagehide', close);
    return () => {
      window.removeEventListener('pagehide', close);
      close();
    };
  }, [handleRef]);
}
