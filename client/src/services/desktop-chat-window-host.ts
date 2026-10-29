import {
  BrowserChatWindowHost,
  type ChatWindowHandle,
  type ChatWindowHost,
} from '@/services/chat-window-host';

/** The native shell keeps the browser opener and adds a checked command for its chat window.
 *
 * Example: `new TauriChatWindowHost(window).open(url, name, features)` */
export class TauriChatWindowHost implements ChatWindowHost {
  private readonly browser: BrowserChatWindowHost;

  constructor(opener: Pick<Window, 'open'>) {
    this.browser = new BrowserChatWindowHost(opener);
  }

  open(url: string, name: string, features: string): ChatWindowHandle | null {
    const opened = this.browser.open(url, name, features);
    return opened ? new NativeChatWindow(opened) : null;
  }
}

class NativeChatWindow implements ChatWindowHandle {
  constructor(private readonly opened: ChatWindowHandle) {}

  get document(): Document {
    return this.opened.document;
  }
  get closed(): boolean {
    return this.opened.closed;
  }
  close(): void {
    this.opened.close();
  }
  focus(): void {
    this.opened.focus();
  }
  async setAlwaysOnTop(enabled: boolean): Promise<void> {
    if (this.closed) throw new Error('cannot pin a closed chat window');
    const page = this.document.defaultView as
      (Window & { __LORKARIUM_CHAT_WINDOW_LABEL__?: unknown }) | null;
    const label = page?.__LORKARIUM_CHAT_WINDOW_LABEL__;
    if (typeof label !== 'string' || !/^chat-\d+$/.test(label)) {
      throw new Error(`native chat marker ${String(label)} is invalid; expected chat-<number>`);
    }
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_chat_always_on_top', { label, enabled });
  }
}
