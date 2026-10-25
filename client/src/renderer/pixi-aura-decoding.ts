import { DOMAdapter, Texture } from 'pixi.js';
import { GifSource } from 'pixi.js/gif';
import type {
  AuraBytesFetcher,
  AuraGifDecoder,
  AuraImageDecoding,
  AuraImageSource,
  AuraStillDecoder,
} from './pixi-aura-sources';

/** The aura images over PixiJS: bytes by the `DOMAdapter` fetch (same origin, the session
 *  cookie), a GIF by `GifSource.from` (every frame a canvas texture, picked by time, never played
 *  by `Ticker.shared`), anything else by `createImageBitmap`. Proven by the e2e.
 *
 *  Example: `new PixiAuraSources(onReady, pixiAuraDecoding())` */
export function pixiAuraDecoding(): AuraImageDecoding {
  return { fetcher: domFetcher, still: bitmapDecoder, gif: gifDecoder };
}

const domFetcher: AuraBytesFetcher = {
  async fetchBytes(url) {
    const response = await DOMAdapter.get().fetch(url, { credentials: 'same-origin' });
    if (!response.ok)
      throw new Error(`Aura image ${url} answered ${response.status}: expected 200.`);
    return response.arrayBuffer();
  },
};

const bitmapDecoder: AuraStillDecoder = {
  async decode(bytes) {
    const bitmap = await createImageBitmap(new Blob([bytes]));
    const texture = Texture.from(bitmap);
    const release = (): void => {
      texture.destroy(true);
      bitmap.close();
    };
    const frames = [{ texture, start: 0, end: 0 }];
    return { kind: 'still', width: bitmap.width, height: bitmap.height, frames, release };
  },
};

const gifDecoder: AuraGifDecoder = {
  decode(bytes): AuraImageSource {
    const source = GifSource.from(bytes);
    const kind = source.totalFrames > 1 ? 'animated' : 'still';
    const { width, height, frames } = source;
    return { kind, width, height, frames, release: () => source.destroy() };
  },
};
