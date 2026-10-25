import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// Same name as STARTUP_EVENT in src-tauri/src/startup_commands.rs.
const STARTUP_EVENT = 'startup';

/** What the splash asks of the shell; the only IPC the app has (capabilities/splash.json). */
export interface ShellBridge {
  onStartupEvent(receive: (payload: unknown) => void): Promise<void>;
  beginStartup(): Promise<void>;
  retryConnection(): Promise<void>;
}

/** The bridge over `@tauri-apps/api`, used by `main.ts`.
 *
 *  Example: `await new TauriShellBridge().beginStartup()` */
export class TauriShellBridge implements ShellBridge {
  async onStartupEvent(receive: (payload: unknown) => void): Promise<void> {
    await listen<unknown>(STARTUP_EVENT, (event) => receive(event.payload));
  }

  beginStartup(): Promise<void> {
    return invoke('begin_startup');
  }

  retryConnection(): Promise<void> {
    return invoke('retry_connection');
  }
}
