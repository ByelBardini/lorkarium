import type { Clipboard } from '@/services/clipboard';

/** Records what was copied; `broken` makes copy and read fail like a denied permission.
 *  `pasteText` is what a read gets back. */
export class ClipboardFake implements Clipboard {
  readonly copied: string[] = [];
  pasteText = '';

  constructor(private readonly broken = false) {}

  async copy(text: string): Promise<boolean> {
    if (this.broken) return false;
    this.copied.push(text);
    return true;
  }

  async readText(): Promise<string | null> {
    return this.broken ? null : this.pasteText;
  }
}
