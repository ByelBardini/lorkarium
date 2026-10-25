import { Texture, TextureSource } from 'pixi.js';
import type {
  AuraBytesFetcher,
  AuraGifDecoder,
  AuraImageSource,
  AuraStillDecoder,
  PixiAuraSources,
} from '@/renderer/pixi-aura-sources';

/** The bytes of a GIF and of a PNG, as far as the signature goes. */
export const GIF_BYTES = Uint8Array.from('GIF89a\x02\x00\x02\x00', (char) => char.charCodeAt(0));
export const PNG_BYTES = Uint8Array.from('\x89PNG\r\n\x1a\n', (char) => char.charCodeAt(0));

/** The network of the aura images: `serve(url, bytes)` answers, anything else fails; every
 *  request is kept in `requests`.
 *
 *  Example: `const fetcher = new AuraBytesFetcherFake().serve(url, GIF_BYTES)` */
export class AuraBytesFetcherFake implements AuraBytesFetcher {
  readonly requests: string[] = [];
  private readonly served = new Map<string, Uint8Array>();

  serve(url: string, bytes: Uint8Array): this {
    this.served.set(url, bytes);
    return this;
  }

  fetchBytes(url: string): Promise<ArrayBuffer> {
    this.requests.push(url);
    const bytes = this.served.get(url);
    if (!bytes) return Promise.reject(new Error(`No image at ${url}`));
    return Promise.resolve(bytes.slice().buffer);
  }
}

/** An aura image of 64 × 32 whose frames last 100 ms each (`release` calls `onRelease`).
 *
 *  Example: `const flames = fakeAuraSource('animated', 2)` */
export function fakeAuraSource(
  kind: AuraImageSource['kind'],
  frames: number,
  onRelease: () => void = () => undefined,
): AuraImageSource {
  const textures = Array.from(
    { length: frames },
    () => new Texture({ source: new TextureSource({ width: 64, height: 32 }) }),
  );
  return {
    kind,
    width: 64,
    height: 32,
    frames: textures.map((texture, index) => ({
      texture,
      start: index * 100,
      end: (index + 1) * 100,
    })),
    release: onRelease,
  };
}

/** The aura sources without the network: every url is loading until `arrive(url, source)`.
 *
 *  Example: `const images = new AuraImagesFake(); images.arrive(url, fakeAuraSource('still', 1))` */
export class AuraImagesFake implements Pick<PixiAuraSources, 'sourceOf'> {
  private readonly ready = new Map<string, AuraImageSource>();

  arrive(url: string, source: AuraImageSource): AuraImageSource {
    this.ready.set(url, source);
    return source;
  }

  sourceOf(url: string): AuraImageSource | null {
    return this.ready.get(url) ?? null;
  }
}

/** Decodes any bytes into a still 64 × 32 image; counts what it decoded and what was released. */
export class StillDecoderFake implements AuraStillDecoder {
  decoded = 0;
  released = 0;

  decode(): Promise<AuraImageSource> {
    this.decoded += 1;
    return Promise.resolve(fakeAuraSource('still', 1, () => (this.released += 1)));
  }
}

/** Decodes any bytes into a GIF of 2 frames of 100 ms, 64 × 32; counts like the still one. */
export class GifDecoderFake implements AuraGifDecoder {
  decoded = 0;
  released = 0;

  decode(): AuraImageSource {
    this.decoded += 1;
    return fakeAuraSource('animated', 2, () => (this.released += 1));
  }
}
