import type { Window as TauriWindow } from '@tauri-apps/api/window';

/** The app's button on the Windows taskbar: lit up to call the person back, put out again. */
export interface TaskbarAttention {
  /** Flashes the button a few times and leaves it lit until the window comes to the front. */
  request(): void;
  /** Puts the button out, flashing or lit. */
  stop(): void;
}

/** The main window's `requestUserAttention` over Tauri's IPC (`Informational`: `FLASHW_TRAY`, 4
 *  flashes, then lit). `@tauri-apps/api` is only fetched inside the shell.
 *
 *  Example: `new TauriTaskbarAttention().request()` */
export class TauriTaskbarAttention implements TaskbarAttention {
  private current: Promise<TauriAttention> | null = null;

  request(): void {
    void this.run((tauri) => tauri.window.requestUserAttention(tauri.informational));
  }

  stop(): void {
    void this.run((tauri) => tauri.window.requestUserAttention(null));
  }

  private async run(call: (tauri: TauriAttention) => Promise<void>): Promise<void> {
    try {
      await call(await this.tauri());
    } catch {
      // A shell older than the permission refuses it: the chat works the same, only without the
      // flash; there is nothing the person could do about it.
    }
  }

  private tauri(): Promise<TauriAttention> {
    this.current ??= loadTauriAttention();
    return this.current;
  }
}

type TauriAttention = Readonly<{
  window: TauriWindow;
  informational: Parameters<TauriWindow['requestUserAttention']>[0];
}>;

async function loadTauriAttention(): Promise<TauriAttention> {
  const { getCurrentWindow, UserAttentionType } = await import('@tauri-apps/api/window');
  return { window: getCurrentWindow(), informational: UserAttentionType.Informational };
}
