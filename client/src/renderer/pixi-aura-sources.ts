import type { Texture } from 'pixi.js';
import { isGifBytes } from './aura-image-kind';
import type { TimedFrame } from './gif-frame';

/** One frame of an aura image: its texture and when it shows (a still image has one, 0 to 0). */
export type AuraImageFrame = TimedFrame & Readonly<{ texture: Texture }>;

/** An aura image ready to draw: still (PNG, JPEG, WebP, a GIF of one frame) or animated (a GIF),
 *  with the size of one frame. `release` frees its textures. */
export type AuraImageSource = Readonly<{
  kind: 'still' | 'animated';
  width: number;
  height: number;
  frames: readonly AuraImageFrame[];
  release: () => void;
}>;

/** Where the bytes of an aura image come from (the network). */
export interface AuraBytesFetcher {
  fetchBytes(url: string): Promise<ArrayBuffer>;
}

/** Turns the bytes of a still image into a source. */
export interface AuraStillDecoder {
  decode(bytes: ArrayBuffer): Promise<AuraImageSource>;
}

/** Turns the bytes of a GIF into a source, every frame decoded. */
export interface AuraGifDecoder {
  decode(bytes: ArrayBuffer): AuraImageSource;
}

export type AuraImageDecoding = Readonly<{
  fetcher: AuraBytesFetcher;
  still: AuraStillDecoder;
  gif: AuraGifDecoder;
}>;

type Entry =
  | Readonly<{ state: 'loading' }>
  | Readonly<{ state: 'ready'; source: AuraImageSource }>
  | Readonly<{ state: 'failed' }>;

/** The images of the auras, loaded once per url and released when no view uses them. Not the
 *  `PixiTextureCache`: the url `/api/assets/<id>` has no extension, and a GIF must be told by its
 *  bytes (`isGifBytes`) to keep its frames. A url that fails stays failed (the aura is not drawn,
 *  nothing retries in a loop); `onReady` runs when a source arrives, to draw it.
 *
 *  Example: `const sources = new PixiAuraSources((url) => tokens.refreshAura(url), pixiAuraDecoding())` */
export class PixiAuraSources {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly onReady: (url: string) => void,
    private readonly decoding: AuraImageDecoding,
  ) {}

  /** The source when it is ready; otherwise starts loading it (once) and answers `null`. */
  sourceOf(url: string): AuraImageSource | null {
    const entry = this.entries.get(url);
    if (!entry) this.load(url);
    return entry?.state === 'ready' ? entry.source : null;
  }

  /** Forgets (and releases) every url the view no longer draws. */
  retain(urls: ReadonlySet<string>): void {
    for (const [url, entry] of this.entries) {
      if (urls.has(url)) continue;
      this.entries.delete(url);
      if (entry.state === 'ready') entry.source.release();
    }
  }

  destroy(): void {
    this.retain(new Set());
  }

  private load(url: string): void {
    this.entries.set(url, { state: 'loading' });
    this.decode(url).then(
      (source) => this.arrived(url, source),
      () => {
        if (this.entries.get(url)?.state === 'loading') this.entries.set(url, { state: 'failed' });
      },
    );
  }

  private async decode(url: string): Promise<AuraImageSource> {
    const bytes = await this.decoding.fetcher.fetchBytes(url);
    const gif = isGifBytes(new Uint8Array(bytes));
    return gif ? this.decoding.gif.decode(bytes) : this.decoding.still.decode(bytes);
  }

  // Forgotten while it loaded (the token lost its aura): nobody will draw it.
  private arrived(url: string, source: AuraImageSource): void {
    if (this.entries.get(url)?.state !== 'loading') return source.release();
    this.entries.set(url, { state: 'ready', source });
    this.onReady(url);
  }
}
