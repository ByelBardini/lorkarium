import type { SessionCache } from '@/services/session-cache';

/** In-memory session cache; `blocked` makes every read and write throw, like a browser with storage disabled. */
export class SessionCacheFake implements SessionCache {
  readonly entries = new Map<string, string>();
  readonly writes: Array<{ key: string; value: string }> = [];
  blocked = false;

  read(key: string): string | null {
    if (this.blocked) throw new DOMException('storage blocked', 'SecurityError');
    return this.entries.get(key) ?? null;
  }

  write(key: string, value: string): void {
    if (this.blocked) throw new DOMException('storage blocked', 'SecurityError');
    this.writes.push({ key, value });
    this.entries.set(key, value);
  }
}
