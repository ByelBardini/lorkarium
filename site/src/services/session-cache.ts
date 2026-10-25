/** Port for a per-tab string cache; both methods may throw when the browser blocks storage. */
export interface SessionCache {
  read(key: string): string | null;
  write(key: string, value: string): void;
}

/** `SessionCache` over `sessionStorage`; errors bubble up for the caller to decide. */
export class BrowserSessionCache implements SessionCache {
  /**
   * The stored value, or null when the key was never written.
   * Example: `new BrowserSessionCache().read('lorkarium:desktop-release')`
   */
  read(key: string): string | null {
    return sessionStorage.getItem(key);
  }

  /**
   * Stores the value for the rest of the tab's life.
   * Example: `new BrowserSessionCache().write('lorkarium:desktop-release', '{"savedAt":0}')`
   */
  write(key: string, value: string): void {
    sessionStorage.setItem(key, value);
  }
}
