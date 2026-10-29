import {
  CHAT_WINDOW_MARK,
  type ChatWindowHandle,
  type ChatWindowHost,
} from '@/services/chat-window-host';

type OpenCall = Readonly<{ url: string; name: string; features: string }>;

/** The chat's own window in specs: an empty document of its own that only becomes the chat page
 *  on `load()`, and closes by the app (`close`) or by the person (`closeByUser`). */
export class ChatWindowFake implements ChatWindowHandle {
  private readonly frame = document.createElement('iframe');
  readonly document: Document;
  closed = false;
  focuses = 0;
  closes = 0;
  setAlwaysOnTop?: (enabled: boolean) => Promise<void>;

  constructor() {
    document.body.append(this.frame);
    const popupDocument = this.frame.contentDocument;
    if (!popupDocument) throw new Error('chat window fake has no document');
    this.document = popupDocument;
  }

  close(): void {
    this.closes += 1;
    this.closed = true;
    this.frame.remove();
  }

  focus(): void {
    this.focuses += 1;
  }

  /** `/chat-window.html` finished loading in place of the first `about:blank`. */
  load(): void {
    this.document.body.setAttribute(CHAT_WINDOW_MARK, '');
  }

  /** The person closed the window by its X. */
  closeByUser(): void {
    this.closed = true;
    this.frame.remove();
  }
}

/** `window.open` in specs: records each call and hands a `ChatWindowFake`, or `null` when the
 *  browser blocks popups (`new ChatWindowHostFake(true)`).
 *
 *  Example: `host.windows[0]?.load()` */
export class ChatWindowHostFake implements ChatWindowHost {
  readonly calls: OpenCall[] = [];
  readonly windows: ChatWindowFake[] = [];

  constructor(private readonly blocking = false) {}

  open(url: string, name: string, features: string): ChatWindowHandle | null {
    this.calls.push({ url, name, features });
    if (this.blocking) return null;
    const opened = new ChatWindowFake();
    this.windows.push(opened);
    return opened;
  }

  /** The last window handed out (the spec fails when none was). */
  last(): ChatWindowFake {
    const opened = this.windows.at(-1);
    if (!opened) throw new Error(`no chat window was opened; calls: ${this.calls.length}`);
    return opened;
  }
}
