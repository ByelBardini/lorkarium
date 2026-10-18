import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { TokenArtView } from './board-view';
import { artBox, flipSigns } from './token-art';

const RADIANS_PER_DEGREE = Math.PI / 180;
/** The circle the round frame crops to, as a share of the token side (the disc's radius). */
export const ROUND_RADIUS_SHARE = 0.42;

/** The image of one token: centered on it, turned by its facing (0 = as drawn, looking down),
 *  mirrored by the flips and, with the round frame, cropped to the circle. */
export class PixiTokenArt {
  readonly container = new Container();
  private readonly sprite = new Sprite();
  private readonly mask = new Graphics();

  constructor() {
    this.sprite.anchor.set(0.5);
    this.container.addChild(this.sprite, this.mask);
    this.container.visible = false;
  }

  /** Draws `art` with `texture` on a token of `side` px; without either, hides itself. */
  draw(art: TokenArtView | null, texture: Texture | null, side: number, facing: number): void {
    this.container.visible = Boolean(art && texture);
    if (!art || !texture) return;
    const center = side / 2;
    const box = artBox(art.frame, texture, side);
    const signs = flipSigns(art.flipX, art.flipY);
    this.sprite.texture = texture;
    this.sprite.position.set(box.x + box.width / 2 - center, box.y + box.height / 2 - center);
    this.sprite.scale.set(
      (signs.x * box.width) / texture.width,
      (signs.y * box.height) / texture.height,
    );
    this.container.position.set(center, center);
    this.container.rotation = facing * RADIANS_PER_DEGREE;
    this.cropTo(art.frame === 'round' ? side * ROUND_RADIUS_SHARE : null);
  }

  private cropTo(radius: number | null): void {
    this.mask.clear();
    if (radius === null) {
      this.container.mask = null;
      this.mask.visible = false;
      return;
    }
    this.mask.circle(0, 0, radius).fill(0xffffff);
    this.mask.visible = true;
    this.container.mask = this.mask;
  }
}
