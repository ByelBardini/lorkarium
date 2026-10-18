import { Container, Sprite } from 'pixi.js';
import type { SceneBackgroundView } from './board-view';
import type { PixiTextureCache } from './pixi-texture-cache';

/** The background image under the grid, stretched to the scene's world size (the master chose to
 *  keep or break the image's proportion when setting the cells). */
export class PixiSceneBackground {
  readonly container = new Container();
  private sprite: Sprite | null = null;

  constructor(private readonly textures: PixiTextureCache) {}

  sync(background: SceneBackgroundView | null): void {
    const texture = background ? this.textures.textureOf(background.url) : null;
    if (!background || !texture) return this.clear();
    if (!this.sprite) {
      this.sprite = new Sprite(texture);
      this.container.addChild(this.sprite);
    }
    this.sprite.texture = texture;
    this.sprite.position.set(0, 0);
    this.sprite.setSize(background.width, background.height);
  }

  private clear(): void {
    this.sprite?.destroy();
    this.sprite = null;
  }
}
