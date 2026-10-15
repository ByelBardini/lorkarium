import type { Clipboard } from '@/services/clipboard';

/** Records what was copied; `broken` makes the copy fail like a denied permission. */
export class ClipboardFake implements Clipboard {
  readonly copied: string[] = [];

  constructor(private readonly broken = false) {}

  async copy(text: string): Promise<boolean> {
    if (this.broken) return false;
    this.copied.push(text);
    return true;
  }
}
