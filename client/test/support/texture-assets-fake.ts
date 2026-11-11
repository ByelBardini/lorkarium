import { Texture, TextureSource } from 'pixi.js';
import type { TextureAsset, TextureAssets } from '@/renderer/pixi-texture-cache';

type Pending = Readonly<{ resolve: (texture: Texture) => void; reject: (error: Error) => void }>;

/** PixiJS `Assets` without the network: each `load` waits until `arrive(url)` (or `fail(url)`)
 *  settles every pending load of that url with one 256 px texture, as `Assets` shares it. Keeps
 *  what was asked (`requests`) and what was unloaded (`unloaded`).
 *
 *  Example: `const assets = new TextureAssetsFake(); cache.textureOf(url); assets.arrive(url)` */
export class TextureAssetsFake implements TextureAssets {
  readonly requests: TextureAsset[] = [];
  readonly unloaded: string[] = [];
  private readonly pending = new Map<string, Pending[]>();

  load(asset: TextureAsset): Promise<Texture> {
    this.requests.push(asset);
    return new Promise((resolve, reject) => {
      const waiting = this.pending.get(asset.src) ?? [];
      this.pending.set(asset.src, [...waiting, { resolve, reject }]);
    });
  }

  unload(url: string): Promise<void> {
    this.unloaded.push(url);
    return Promise.resolve();
  }

  /** Settles the loads of `url` with a texture and waits for the cache to see it. */
  async arrive(url: string): Promise<Texture> {
    const texture = new Texture({ source: new TextureSource({ width: 256, height: 256 }) });
    for (const { resolve } of this.take(url)) resolve(texture);
    await Promise.resolve();
    return texture;
  }

  /** Rejects the loads of `url` and waits for the cache to see it. */
  async fail(url: string): Promise<void> {
    for (const { reject } of this.take(url)) reject(new Error(`no image at ${url}`));
    await Promise.resolve();
  }

  private take(url: string): Pending[] {
    const waiting = this.pending.get(url) ?? [];
    this.pending.delete(url);
    return waiting;
  }
}
