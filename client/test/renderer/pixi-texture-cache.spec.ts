import { describe, expect, it } from 'vitest';
import { PixiTextureCache } from '@/renderer/pixi-texture-cache';
import { TextureAssetsFake } from '../support/texture-assets-fake';

const GOBLIN = '/api/assets/goblin';
const MAP = '/api/assets/map';

function cacheWith(idleLimit = 2) {
  const assets = new TextureAssetsFake();
  const ready: string[] = [];
  const cache = new PixiTextureCache((url) => ready.push(url), assets, idleLimit);
  return { cache, assets, ready };
}

async function loaded(cache: PixiTextureCache, assets: TextureAssetsFake, ...urls: string[]) {
  for (const url of urls) cache.textureOf(url);
  for (const url of urls) await assets.arrive(url);
}

const urlsOf = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `/api/assets/art-${index}`);

describe('PixiTextureCache keeps what the view stops drawing in a slack', () => {
  it('a texture the view stops drawing stays loaded while the slack has room', async () => {
    const { cache, assets } = cacheWith(2);
    await loaded(cache, assets, GOBLIN);

    cache.retain(new Set());

    expect(assets.unloaded).toEqual([]);
  });

  it('the url back inside the slack is ready at once, with no new load', async () => {
    const { cache, assets } = cacheWith(2);
    await loaded(cache, assets, GOBLIN);
    cache.retain(new Set());

    const back = cache.textureOf(GOBLIN);

    expect(back).not.toBeNull();
    expect(assets.requests).toHaveLength(1);
  });

  it('past the slack the oldest dropped texture is unloaded, and only it', async () => {
    const { cache, assets } = cacheWith(2);
    const [first = '', second = '', third = ''] = urlsOf(3);
    await loaded(cache, assets, first, second, third);
    cache.retain(new Set([second, third]));
    cache.retain(new Set([third]));

    cache.retain(new Set());

    expect(assets.unloaded).toEqual([first]);
  });

  it('a texture taken back and dropped again counts as the newest of the slack', async () => {
    const { cache, assets } = cacheWith(2);
    const [first = '', second = '', third = ''] = urlsOf(3);
    await loaded(cache, assets, first, second, third);
    cache.retain(new Set([second, third]));
    cache.textureOf(first);
    cache.retain(new Set([third]));

    cache.retain(new Set());

    expect(assets.unloaded).toEqual([second]);
  });

  it('destroy unloads the slack too', async () => {
    const { cache, assets } = cacheWith(2);
    await loaded(cache, assets, GOBLIN, MAP);
    cache.retain(new Set([MAP]));

    cache.destroy();

    expect(assets.unloaded.sort()).toEqual([GOBLIN, MAP]);
  });
});

describe('PixiTextureCache loads once and tells when it arrived', () => {
  it('the same url asked twice while loading is loaded once', () => {
    const { cache, assets } = cacheWith();

    cache.textureOf(GOBLIN);
    cache.textureOf(GOBLIN);

    expect(assets.requests).toHaveLength(1);
  });

  it('every image is asked with mipmaps generated', () => {
    const { cache, assets } = cacheWith();

    cache.textureOf(MAP);

    expect(assets.requests).toEqual([
      { src: MAP, parser: 'texture', data: { autoGenerateMipmaps: true } },
    ]);
  });

  it('onReady names the url that arrived', async () => {
    const { cache, assets, ready } = cacheWith();

    await loaded(cache, assets, GOBLIN);

    expect(ready).toEqual([GOBLIN]);
  });

  it('a url that fails stays failed, never loaded again', async () => {
    const { cache, assets } = cacheWith();
    cache.textureOf(GOBLIN);
    await assets.fail(GOBLIN);

    expect(cache.textureOf(GOBLIN)).toBeNull();
    expect(assets.requests).toHaveLength(1);
  });
});

describe('PixiTextureCache unloads what arrives after it was dropped', () => {
  it('a texture dropped while loading is unloaded when it arrives, and never ready', async () => {
    const { cache, assets, ready } = cacheWith();
    cache.textureOf(GOBLIN);
    cache.retain(new Set());

    await assets.arrive(GOBLIN);

    expect(assets.unloaded).toEqual([GOBLIN]);
    expect(ready).toEqual([]);
  });

  it('dropped while loading and asked again, the arrival is kept and not unloaded', async () => {
    const { cache, assets, ready } = cacheWith();
    cache.textureOf(GOBLIN);
    cache.retain(new Set());
    cache.textureOf(GOBLIN);

    await assets.arrive(GOBLIN);

    expect(assets.unloaded).toEqual([]);
    expect(ready).toEqual([GOBLIN]);
    expect(cache.textureOf(GOBLIN)).not.toBeNull();
  });
});
