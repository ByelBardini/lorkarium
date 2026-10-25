import { Texture, TextureSource } from 'pixi.js';
import type { PixiTextureCache } from '@/renderer/pixi-texture-cache';

/** The board's image cache without the network: every url is loading until `arrive(url)` hands
 *  it a square 256 px texture (the size the server keeps a condition image at).
 *
 *  Example: `const textures = new TokenTexturesFake(); const square = textures.arrive(url)` */
export class TokenTexturesFake implements Pick<PixiTextureCache, 'textureOf'> {
  private readonly ready = new Map<string, Texture>();

  textureOf(url: string): Texture | null {
    return this.ready.get(url) ?? null;
  }

  arrive(url: string): Texture {
    const texture = new Texture({ source: new TextureSource({ width: 256, height: 256 }) });
    this.ready.set(url, texture);
    return texture;
  }
}
