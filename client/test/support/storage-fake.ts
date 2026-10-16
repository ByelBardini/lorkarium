import type { KeyValueStorage } from '@/stores/rail-store';

/** In-memory `localStorage` / `sessionStorage`; `broken` makes every read and write throw, like a blocked storage. */
export class StorageFake implements KeyValueStorage {
  readonly values = new Map<string, string>();

  constructor(private readonly broken = false) {}

  getItem(key: string): string | null {
    if (this.broken) throw new DOMException('storage blocked', 'SecurityError');
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.broken) throw new DOMException('storage blocked', 'SecurityError');
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    if (this.broken) throw new DOMException('storage blocked', 'SecurityError');
    this.values.delete(key);
  }
}
