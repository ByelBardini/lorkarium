/** The system clipboard behind a project interface, so tests can read what was copied. */
export interface Clipboard {
  /** Resolves `false` when the browser refuses (no permission, insecure context). */
  copy(text: string): Promise<boolean>;
}

/** `Clipboard` over `navigator.clipboard`.
 *
 *  Example: `await new NavigatorClipboard().copy('VHRN-7K2Q')` */
export class NavigatorClipboard implements Clipboard {
  async copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
}
