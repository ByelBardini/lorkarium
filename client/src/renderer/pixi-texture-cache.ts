import { Assets, type Texture } from 'pixi.js';

type Entry =
  | Readonly<{ state: 'loading' }>
  | Readonly<{ state: 'ready'; texture: Texture }>
  | Readonly<{ state: 'failed' }>;

/** The images of the board (background and token art), loaded once per url and unloaded when no
 *  view uses them any more. A url that fails stays failed: the token keeps its initials disc and
 *  nothing retries in a loop. `onReady` runs when a texture arrives, to draw again. */
export class PixiTextureCache {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly onReady: (url: string) => void) {}

  /** The texture when it is ready; otherwise starts loading it (once) and answers `null`. */
  textureOf(url: string): Texture | null {
    const entry = this.entries.get(url);
    if (!entry) this.load(url);
    return entry?.state === 'ready' ? entry.texture : null;
  }

  /** Forgets (and unloads) every url the view no longer draws. */
  retain(urls: ReadonlySet<string>): void {
    for (const [url, entry] of this.entries) {
      if (urls.has(url)) continue;
      this.entries.delete(url);
      if (entry.state === 'ready') void Assets.unload(url).catch(() => undefined);
    }
  }

  destroy(): void {
    this.retain(new Set());
  }

  private load(url: string): void {
    this.entries.set(url, { state: 'loading' });
    // `/api/assets/<id>` has no extension, so the parser is named (PixiJS 8 `Assets`).
    Assets.load<Texture>({ src: url, parser: 'texture' }).then(
      (texture) => {
        if (this.entries.get(url)?.state !== 'loading') return;
        this.entries.set(url, { state: 'ready', texture });
        this.onReady(url);
      },
      () => {
        if (this.entries.get(url)?.state === 'loading') this.entries.set(url, { state: 'failed' });
      },
    );
  }
}
