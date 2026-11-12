import { ROUND_RADIUS_SHARE } from '@lorkarium/game-core';
import { Container, Graphics, Matrix, Sprite, type Texture } from 'pixi.js';
import type { TokenArtView } from './board-view';
import { artPlacement, type ArtImageSize, type ArtPlacement } from './token-art';

const RADIANS_PER_DEGREE = Math.PI / 180;
export { ROUND_RADIUS_SHARE };

type Shade = Readonly<{ color: number; alpha: number }>;

/** The image of one token: centered on it, turned by its facing (0 = as drawn, looking right),
 *  mirrored by the flips. The round frame is an ellipse filled with the texture, never a mask: a
 *  mask per token broke the GPU batch on every round token (performance.md). The square frame is a
 *  plain sprite. */
export class PixiTokenArt {
  readonly container = new Container();
  private readonly sprite = new Sprite();
  private readonly round = new Graphics();

  constructor() {
    this.sprite.anchor.set(0.5);
    this.container.addChild(this.sprite, this.round);
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
    const placement = artPlacement(art, texture, token);
    this.container.position.set(token.width / 2, token.height / 2);
    this.container.rotation = facing * RADIANS_PER_DEGREE;
    this.round.clear();
    this.sprite.visible = art.frame === 'square';
    this.round.visible = art.frame === 'round';
    if (art.frame === 'round') return this.fillRound(texture, placement, token);
    this.sprite.texture = texture;
    this.sprite.position.set(placement.x, placement.y);
    this.sprite.scale.set(placement.scaleX, placement.scaleY);
  }

  /** Paints the image one flat color, keeping its transparency (the silhouette in the
   *  penumbra), or back as drawn with `null`.
   *
   *  Example: `art.shade({ color: 0x000000, alpha: 0.9 })` */
  shade(fill: Shade | null): void {
    for (const image of [this.sprite, this.round]) {
      image.tint = fill?.color ?? 0xffffff;
      image.alpha = fill?.alpha ?? 1;
    }
  }

  // The fill matrix takes the texture's px to the container's: centered, scaled and flipped as
  // the sprite would be, so both frames place the image the same way. `global` is what reads the
  // matrix in px; the default `local` reads it in units of the ellipse's bounds, and the image came
  // out a few px wide, tiled over the token (#83).
  private fillRound(texture: Texture, placement: ArtPlacement, token: ArtImageSize): void {
    const matrix = new Matrix()
      .translate(-texture.width / 2, -texture.height / 2)
      .scale(placement.scaleX, placement.scaleY)
      .translate(placement.x, placement.y);
    const share = ROUND_RADIUS_SHARE;
    this.round.ellipse(0, 0, token.width * share, token.height * share).fill({
      texture,
      matrix,
      textureSpace: 'global',
    });
  }
}
