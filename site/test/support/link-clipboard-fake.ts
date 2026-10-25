import type { LinkClipboard } from '@/services/link-clipboard';

/** Keeps what was copied; `refuse()` makes it answer like a browser that denies the clipboard. */
export class LinkClipboardFake implements LinkClipboard {
  readonly copied: string[] = [];
  private accepts = true;

  refuse(): this {
    this.accepts = false;
    return this;
  }

  async copy(text: string): Promise<boolean> {
    if (!this.accepts) return false;
    this.copied.push(text);
    return true;
  }
}
