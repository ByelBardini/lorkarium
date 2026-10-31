/** The page the chat's own window opens: empty, of the app's origin (`client/public/`). The
 *  desktop shell lets exactly this path become its second native window. */
export const CHAT_WINDOW_URL = '/chat-window.html';
export const DICE_WINDOW_URL = '/chat-window.html?panel=dice';
export const IMAGE_WINDOW_URL = '/chat-window.html?panel=image';
export const IMAGE_WINDOW_FEATURES = 'popup,width=960,height=720';
export const DOCUMENT_WINDOW_URL = '/chat-window.html?panel=document';
export const DOCUMENT_WINDOW_FEATURES = 'popup,width=1000,height=800';
export const SHEET_WINDOW_URL = '/chat-window.html?panel=sheet';
export const SHEET_WINDOW_FEATURES = 'popup,width=720,height=800';
export const SHEET_TEMPLATE_WINDOW_URL = '/chat-window.html?panel=sheet-template';
// The code beside the preview: the library's editor width.
export const SHEET_TEMPLATE_WINDOW_FEATURES = 'popup,width=1100,height=800';
export const SHEET_PREVIEW_WINDOW_URL = '/chat-window.html?panel=sheet-preview';
// A sheet's own size: the room's sheet window.
export const SHEET_PREVIEW_WINDOW_FEATURES = 'popup,width=720,height=800';

/** A system window (not a tab) the size of the room's side panel. */
export const CHAT_WINDOW_FEATURES = 'popup,width=420,height=720';

/** The attribute on the chat page's `<body>`: the first `about:blank` of a new window lacks it,
 *  so it tells that the page the portal goes into has loaded. */
export const CHAT_WINDOW_MARK = 'data-lorkarium-chat-window';

/** The part of the opened `Window` the chat uses; a real `Window` fits it. */
export interface ChatWindowHandle {
  readonly desktopWindow?: import('./desktop-window').DesktopWindow | null;
  readonly closed: boolean;
  readonly document: Document;
  close(): void | Promise<void>;
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
