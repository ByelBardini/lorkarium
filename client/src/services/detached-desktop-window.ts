import type { ChatWindowHandle } from './chat-window-host';
import type { DesktopWindow } from './desktop-window';

/** Native controls invoked by the opener for its auxiliary window. Example: `new DetachedDesktopWindow(handle).minimize()` */
export class DetachedDesktopWindow implements DesktopWindow {
  closed = false;
  private closing: Promise<void> | null = null;
  private invoke: (typeof import('@tauri-apps/api/core'))['invoke'] | null = null;
  constructor(private readonly opened: ChatWindowHandle) {}

  minimize(): Promise<void> {
    return this.command('minimize');
  }
  toggleMaximize(): Promise<void> {
    return this.command('toggle-maximize');
  }
  close(): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.closing ??= this.command<void>('close')
      .then(() => {
        this.closed = true;
      })
      .finally(() => {
        this.closing = null;
      });
    return this.closing;
  }
  isMaximized(): Promise<boolean> {
    return this.command('is-maximized');
  }

  async onMaximizedChange(listener: (maximized: boolean) => void): Promise<() => void> {
    const view = this.opened.document.defaultView;
    const update = (): void => {
      void this.isMaximized().then(listener, () => undefined);
    };
    view?.addEventListener('resize', update);
    return () => view?.removeEventListener('resize', update);
  }

  private async command<T>(action: string): Promise<T> {
    const label = nativeChatLabelOf(this.opened);
    if (this.invoke) return this.invoke<T>('control_detached_window', { label, action });
    const { invoke } = await import('@tauri-apps/api/core');
    this.invoke = invoke;
    return invoke<T>('control_detached_window', { label, action });
  }
}

/** Reads the immutable native marker after the popup loads. Example: `nativeChatLabelOf(handle)` */
export function nativeChatLabelOf(opened: ChatWindowHandle): string {
  if (opened.closed) throw new Error('cannot control a closed chat window');
  const page = opened.document.defaultView as
    (Window & { __LORKARIUM_CHAT_WINDOW_LABEL__?: unknown }) | null;
  const label = page?.__LORKARIUM_CHAT_WINDOW_LABEL__;
  if (typeof label !== 'string' || !/^chat-\d+$/.test(label)) {
    throw new Error(`native chat marker ${String(label)} is invalid; expected chat-<number>`);
  }
  return label;
}
