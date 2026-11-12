import { describe, expect, it } from 'vitest';
import { PixiAuraSources } from '@/renderer/pixi-aura-sources';
import {
  AuraBytesFetcherFake,
  GIF_BYTES,
  GifDecoderFake,
  PNG_BYTES,
  StillDecoderFake,
} from '../support/aura-decoding-fakes';

const RUNE = '/api/assets/rune';
const FLAMES = '/api/assets/flames';

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function sourcesWith(fetcher = new AuraBytesFetcherFake(), idleLimit = 4) {
  const still = new StillDecoderFake();
  const gif = new GifDecoderFake();
  const ready: string[] = [];
  const sources = new PixiAuraSources((url) => ready.push(url), { fetcher, still, gif }, idleLimit);
  return { sources, fetcher, still, gif, ready };
}

describe('PixiAuraSources', () => {
  it('a GIF, told by its bytes, arrives animated', async () => {
    const { sources } = sourcesWith(new AuraBytesFetcherFake().serve(FLAMES, GIF_BYTES));
    sources.sourceOf(FLAMES);
    await settle();

    expect(sources.sourceOf(FLAMES)?.kind).toBe('animated');
  });

  it('a PNG arrives still', async () => {
    const { sources } = sourcesWith(new AuraBytesFetcherFake().serve(RUNE, PNG_BYTES));
    sources.sourceOf(RUNE);
    await settle();

    expect(sources.sourceOf(RUNE)?.kind).toBe('still');
  });

  it('answers nothing while the image loads', () => {
    const { sources } = sourcesWith(new AuraBytesFetcherFake().serve(RUNE, PNG_BYTES));

    expect(sources.sourceOf(RUNE)).toBeNull();
  });

  it('the same url asked twice is fetched once', async () => {
    const { sources, fetcher } = sourcesWith(new AuraBytesFetcherFake().serve(RUNE, PNG_BYTES));
    sources.sourceOf(RUNE);
    sources.sourceOf(RUNE);
    await settle();
    sources.sourceOf(RUNE);

    expect(fetcher.requests).toEqual([RUNE]);
  });

  it('a url that fails stays failed, never fetched again', async () => {
    const { sources, fetcher } = sourcesWith();
    sources.sourceOf(RUNE);
    await settle();

    expect(sources.sourceOf(RUNE)).toBeNull();
    await settle();
    expect(fetcher.requests).toEqual([RUNE]);
  });

  it('onReady names the url that arrived, once', async () => {
    const { sources, ready } = sourcesWith(new AuraBytesFetcherFake().serve(RUNE, PNG_BYTES));
    sources.sourceOf(RUNE);
    await settle();

    expect(ready).toEqual([RUNE]);
  });

  it('retain without the url keeps the source in the slack, released only past it', async () => {
    const fetcher = new AuraBytesFetcherFake().serve(RUNE, PNG_BYTES).serve(FLAMES, GIF_BYTES);
    const { sources, still, gif } = sourcesWith(fetcher, 1);
    sources.sourceOf(RUNE);
    sources.sourceOf(FLAMES);
    await settle();
    sources.retain(new Set([FLAMES]));
    expect([still.released, gif.released]).toEqual([0, 0]);

    sources.retain(new Set());

    expect([still.released, gif.released]).toEqual([1, 0]);
  });

  it('an animated aura that leaves the sight and comes back inside the slack decodes its GIF once', async () => {
    const { sources, gif, fetcher } = sourcesWith(
      new AuraBytesFetcherFake().serve(FLAMES, GIF_BYTES),
    );
    sources.sourceOf(FLAMES);
    await settle();
    sources.retain(new Set());

    const back = sources.sourceOf(FLAMES);

    expect(back?.kind).toBe('animated');
    expect(gif.decoded).toBe(1);
    expect(fetcher.requests).toEqual([FLAMES]);
  });

  it('destroy releases the slack too', async () => {
    const { sources, still } = sourcesWith(new AuraBytesFetcherFake().serve(RUNE, PNG_BYTES));
    sources.sourceOf(RUNE);
    await settle();
    sources.retain(new Set());

    sources.destroy();

    expect(still.released).toBe(1);
  });

  it('an image that arrives after it was forgotten is released, not kept', async () => {
    const { sources, still, ready } = sourcesWith(
      new AuraBytesFetcherFake().serve(RUNE, PNG_BYTES),
    );
    sources.sourceOf(RUNE);
    sources.retain(new Set());
    await settle();

    expect(still.released).toBe(1);
    expect(ready).toEqual([]);
  });
});
