import {
  BrowserChatWindowHost,
  type ChatWindowHandle,
  type ChatWindowHost,
} from '@/services/chat-window-host';
import { DetachedDesktopWindow, nativeChatLabelOf } from './detached-desktop-window';
import type { DesktopWindow } from './desktop-window';

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
  private controls: DetachedDesktopWindow | null = null;
  constructor(private readonly opened: ChatWindowHandle) {}

  get desktopWindow(): DesktopWindow | null {
    const page = this.document.defaultView as
      (Window & { __LORKARIUM_DETACHED_TITLE_BAR__?: boolean }) | null;
    if (!page?.__LORKARIUM_DETACHED_TITLE_BAR__) return null;
    this.controls ??= new DetachedDesktopWindow(this.opened);
    return this.controls;
  }

  get document(): Document {
    return this.opened.document;
  }
  get closed(): boolean {
    return this.opened.closed || !!this.controls?.closed;
  }
  close(): void | Promise<void> {
    if (this.closed) return;
    const controls = this.desktopWindow;
    return controls ? controls.close() : this.opened.close();
  }
  focus(): void {
    this.opened.focus();
  }
  async setAlwaysOnTop(enabled: boolean): Promise<void> {
    const label = nativeChatLabelOf(this.opened);
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_chat_always_on_top', { label, enabled });
  }
}
