import type { Window as TauriWindow } from '@tauri-apps/api/window';

/** The desktop shell's window, driven by the page's own title bar. */
export interface DesktopWindow {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  /** The shell hides the window in the tray instead of quitting. */
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  /** Tells the listener the maximized state after each resize; resolves to the unsubscribe. */
  onMaximizedChange(listener: (maximized: boolean) => void): Promise<() => void>;
}

/** A window command the shell refused or could not run. */
export class DesktopWindowError extends Error {
  constructor(command: string, reason: unknown) {
    super(`the desktop window refused "${command}": ${String(reason)}`);
    this.name = 'DesktopWindowError';
  }
}

/** The window over Tauri's IPC; `@tauri-apps/api` is only fetched inside the shell.
 *
 *  Example: `new TauriDesktopWindow().minimize()` */
export class TauriDesktopWindow implements DesktopWindow {
  private current: Promise<TauriWindow> | null = null;

  minimize(): Promise<void> {
    return this.run('minimize', (window) => window.minimize());
  }

  toggleMaximize(): Promise<void> {
    return this.run('toggleMaximize', (window) => window.toggleMaximize());
  }

  close(): Promise<void> {
    return this.run('close', (window) => window.close());
  }

  isMaximized(): Promise<boolean> {
    return this.run('isMaximized', (window) => window.isMaximized());
  }

  onMaximizedChange(listener: (maximized: boolean) => void): Promise<() => void> {
    return this.run('onResized', (window) =>
      window.onResized(() => {
        void window.isMaximized().then(listener, () => undefined);
      }),
    );
  }

  private async run<T>(command: string, call: (window: TauriWindow) => Promise<T>): Promise<T> {
    try {
      return await call(await this.window());
    } catch (reason) {
      throw new DesktopWindowError(command, reason);
    }
  }

  private window(): Promise<TauriWindow> {
    this.current ??= loadCurrentWindow();
    return this.current;
  }
}

async function loadCurrentWindow(): Promise<TauriWindow> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}
