export interface LinkClipboard {
  /** Resolves false when the browser refuses the clipboard, never rejects. */
  copy(text: string): Promise<boolean>;
}

export class NavigatorLinkClipboard implements LinkClipboard {
  async copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
}
