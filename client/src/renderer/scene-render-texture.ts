import { RenderTexture } from 'pixi.js';

// A scene of 100 cells at 64 px is 6400 px a side (~164 MB in RGBA) and past the GPU's texture
// limit: what covers the whole scene is drawn smaller, and a blurred edge does not show.
const SCENE_TEXTURE_SIDE_MAX = 2048;

/** A texture the size of the scene, at a resolution that keeps its longest side within 2048 px:
 *  the openings of the fog and the tint of the lights are drawn into one. A new scene size makes
 *  a new texture and frees the old one.
 *
 *  Example: `renderer.render({ container, target: sceneTexture.of(width, height), clear: true })` */
export class SceneRenderTexture {
  private texture: RenderTexture | null = null;

  of(width: number, height: number): RenderTexture {
    if (this.texture?.width === width && this.texture.height === height) return this.texture;
    this.texture?.destroy(true);
    const resolution = Math.min(1, SCENE_TEXTURE_SIDE_MAX / Math.max(width, height));
    this.texture = RenderTexture.create({ width, height, resolution });
    return this.texture;
  }

  destroy(): void {
    this.texture?.destroy(true);
    this.texture = null;
  }
}
