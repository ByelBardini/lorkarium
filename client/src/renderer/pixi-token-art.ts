import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { TokenArtView } from './board-view';
import { artBox, flipSigns, type ArtImageSize } from './token-art';

const RADIANS_PER_DEGREE = Math.PI / 180;
/** The ellipse the round frame crops to, as a share of each token side (the disc's radius). */
export const ROUND_RADIUS_SHARE = 0.42;

/** The image of one token: centered on it, turned by its facing (0 = as drawn, looking right),
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

  /** Draws `art` with `texture` on a token of `token` px; without either, hides itself. */
  draw(
    art: TokenArtView | null,
    texture: Texture | null,
    token: ArtImageSize,
    facing: number,
  ): void {
    this.container.visible = Boolean(art && texture);
    if (!art || !texture) return;
    const center = { x: token.width / 2, y: token.height / 2 };
    const box = artBox(art.frame, texture, token);
    const signs = flipSigns(art.flipX, art.flipY);
    this.sprite.texture = texture;
    this.sprite.position.set(box.x + box.width / 2 - center.x, box.y + box.height / 2 - center.y);
    this.sprite.scale.set(
      (signs.x * box.width) / texture.width,
      (signs.y * box.height) / texture.height,
    );
    this.container.position.set(center.x, center.y);
    this.container.rotation = facing * RADIANS_PER_DEGREE;
    this.cropTo(art.frame === 'round' ? token : null);
  }

  /** Paints the image one flat color, keeping its transparency (the silhouette in the
   *  penumbra), or back as drawn with `null`.
   *
   *  Example: `art.shade({ color: 0x000000, alpha: 0.9 })` */
  shade(fill: Readonly<{ color: number; alpha: number }> | null): void {
    this.sprite.tint = fill?.color ?? 0xffffff;
    this.sprite.alpha = fill?.alpha ?? 1;
  }

  private cropTo(token: ArtImageSize | null): void {
    this.mask.clear();
    if (token === null) {
      this.container.mask = null;
      this.mask.visible = false;
      return;
    }
    const share = ROUND_RADIUS_SHARE;
    this.mask.ellipse(0, 0, token.width * share, token.height * share).fill(0xffffff);
    this.mask.visible = true;
    this.container.mask = this.mask;
  }
}
