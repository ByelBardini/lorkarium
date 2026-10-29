import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import {
  CHAT_WINDOW_FEATURES,
  CHAT_WINDOW_MARK,
  CHAT_WINDOW_URL,
  type ChatWindowHandle,
  type ChatWindowHost,
} from '@/services/chat-window-host';
import { useChatWindowTopmost, type ChatWindowTopmost } from './use-chat-window-topmost';

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
  }>;

type ChatWindowState = Readonly<{
  status: ChatWindowStatus;
  target: HTMLElement | null;
  canAlwaysOnTop: boolean;
}>;

const DOCKED: ChatWindowState = { status: 'docked', target: null, canAlwaysOnTop: false };

/** The chat of one table in its own system window, mirrored from the room by a portal: the hook
 *  owns the window (open, focus, close when the room goes away) and follows its X.
 *
 *  Example: `const chatWindow = useChatWindow(campaignId, deps.chatWindowHost); chatWindow.open()` */
export function useChatWindow(campaignId: string, host: ChatWindowHost): ChatWindow {
  const [state, setState] = useState<ChatWindowState>(DOCKED);
  const handleRef = useRef<ChatWindowHandle | null>(null);
  const { resetAlwaysOnTop, ...topmost } = useChatWindowTopmost(handleRef);
  useFollowChatWindow(handleRef, state.status === 'detached', setState);
  useCloseChatWindowOnLeave(handleRef);
  const open = useCallback(() => {
    const current = handleRef.current;
    if (current && !current.closed) return current.focus();
    resetAlwaysOnTop();
    const opened = host.open(CHAT_WINDOW_URL, chatWindowNameOf(campaignId), CHAT_WINDOW_FEATURES);
    handleRef.current = opened;
    setState({
      status: opened ? 'detached' : 'blocked',
      target: null,
      canAlwaysOnTop: !!opened?.setAlwaysOnTop,
    });
  }, [campaignId, host, resetAlwaysOnTop]);
  const bringBack = useCallback(() => {
    handleRef.current?.close();
    handleRef.current = null;
    setState(DOCKED);
    resetAlwaysOnTop();
  }, [resetAlwaysOnTop]);
  return {
    ...topmost,
    alwaysOnTop: state.status === 'detached' && topmost.alwaysOnTop,
    status: state.status,
    open,
    bringBack,
    portalTarget: state.target,
    canAlwaysOnTop: state.canAlwaysOnTop,
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
    const follow = (): void => {
      const handle = handleRef.current;
      if (!handle || handle.closed) handleRef.current = null;
      setState((previous) => nextChatWindowState(previous, handleRef.current));
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
  return { status: 'detached', target, canAlwaysOnTop: !!handle.setAlwaysOnTop };
}

function loadedChatBodyOf(handle: ChatWindowHandle): HTMLElement | null {
  const body = handle.document.body;
  return body?.hasAttribute(CHAT_WINDOW_MARK) ? body : null;
}

// Leaving the room unmounts the hook; a reload or closing the tab does not, so `pagehide` too.
// Either way a window left behind would be a blank page with no React behind it.
function useCloseChatWindowOnLeave(handleRef: RefObject<ChatWindowHandle | null>): void {
  useEffect(() => {
    const close = (): void => {
      const handle = handleRef.current;
      handleRef.current = null;
      handle?.close();
    };
    window.addEventListener('pagehide', close);
    return () => {
      window.removeEventListener('pagehide', close);
      close();
    };
  }, [handleRef]);
}
