/** The page the chat's own window opens: empty, of the app's origin (`client/public/`). The
 *  desktop shell lets exactly this path become its second native window. */
export const CHAT_WINDOW_URL = '/chat-window.html';

/** A system window (not a tab) the size of the room's side panel. */
export const CHAT_WINDOW_FEATURES = 'popup,width=420,height=720';

/** The attribute on the chat page's `<body>`: the first `about:blank` of a new window lacks it,
 *  so it tells that the page the portal goes into has loaded. */
export const CHAT_WINDOW_MARK = 'data-lorkarium-chat-window';

/** The part of the opened `Window` the chat uses; a real `Window` fits it. */
export interface ChatWindowHandle {
  readonly closed: boolean;
  readonly document: Document;
  close(): void;
  focus(): void;
  /** Available only when the host can guarantee a native always-on-top window. */
  setAlwaysOnTop?(enabled: boolean): Promise<void>;
}

/** Opens the chat's own window; `null` when the browser blocks it. */
export interface ChatWindowHost {
  open(url: string, name: string, features: string): ChatWindowHandle | null;
}

/** `window.open` of the main window: the new window keeps `window.opener`, which the portal needs.
 *
 *  Example: `new BrowserChatWindowHost(window).open(CHAT_WINDOW_URL, name, CHAT_WINDOW_FEATURES)` */
export class BrowserChatWindowHost implements ChatWindowHost {
  constructor(private readonly opener: Pick<Window, 'open'>) {}

  open(url: string, name: string, features: string): ChatWindowHandle | null {
    return this.opener.open(url, name, features);
  }
}
