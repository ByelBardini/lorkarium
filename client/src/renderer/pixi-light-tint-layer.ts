import { Container, Graphics, Sprite, Texture, type Renderer } from 'pixi.js';
import type { Point } from './camera';
import type { LightTintView } from './light-tint-view';
import { SceneRenderTexture } from './scene-render-texture';

/** How strongly a fully lit area takes the color of its light: enough to read the light, never so
 *  much that the map turns into paint. */
export const LIGHT_TINT_ALPHA = 0.18;
// The penumbra takes half the tint of the bright light.
const PENUMBRA_TINT = 0.5;

/** The tint of the colored lights: each light painted opaque into one texture of the scene (the
 *  bright area whole, the penumbra at half), the texture shown at `LIGHT_TINT_ALPHA`. Five torches
 *  over one spot tint as much as one, and where two colors meet the last one wins. Above the
 *  tokens, under the fog. Redrawn only when the tint's key changes. Proven by the e2e.
 *
 *  Example: `tint.sync(view.lightTint, app.renderer)` */
export class PixiLightTintLayer {
  readonly container = new Container();
  private readonly sprite = new Sprite(Texture.EMPTY);
  private readonly drawing = new Graphics();
  private readonly target = new SceneRenderTexture();
  private key: string | null = null;

  constructor() {
    this.sprite.alpha = LIGHT_TINT_ALPHA;
    this.container.addChild(this.sprite);
  }

  sync(tint: LightTintView | null, renderer: Renderer): void {
    this.container.visible = tint !== null;
    if (!tint || tint.key === this.key) return;
    this.key = tint.key;
    this.drawing.clear();
    for (const { color, bright, dim } of tint.tints) {
      fillArea(this.drawing, dim, color, PENUMBRA_TINT);
      fillArea(this.drawing, bright, color, 1);
    }
    const target = this.target.of(tint.width, tint.height);
    renderer.render({ container: this.drawing, target, clear: true });
    this.sprite.texture = target;
  }

  destroy(): void {
    this.target.destroy();
  }
}

function fillArea(graphics: Graphics, area: readonly Point[], color: number, alpha: number): void {
  if (area.length < 3) return;
  graphics.poly(area.flatMap(({ x, y }) => [x, y])).fill({ color, alpha });
}
