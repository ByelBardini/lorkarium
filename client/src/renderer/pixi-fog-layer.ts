import { Container, Graphics } from 'pixi.js';
import type { FogView } from './fog-view';

const FOG_COLOR = 0x000000;
const PENUMBRA_ALPHA = 0.55;

/** The fog on the canvas: two sheets of the scene's size, an opaque one cut (inverse mask) by
 *  the dim areas and one at 55% cut by the bright areas, both cut by the viewer's own tokens.
 *  Above the board and its tokens, under the ruler, the handles and the walls. Redrawn only when
 *  the fog's key changes. Proven by the e2e. */
export class PixiFogLayer {
  readonly container = new Container();
  private readonly dark = new Graphics();
  private readonly dimmed = new Graphics();
  private readonly darkMask = new Graphics();
  private readonly dimMask = new Graphics();
  private key: string | null = null;

  constructor() {
    this.container.addChild(this.darkMask, this.dimMask, this.dimmed, this.dark);
    this.dark.setMask({ mask: this.darkMask, inverse: true });
    this.dimmed.setMask({ mask: this.dimMask, inverse: true });
  }

  sync(fog: FogView | null): void {
    this.container.visible = fog !== null;
    if (!fog || fog.key === this.key) return;
    this.key = fog.key;
    this.dark.clear().rect(0, 0, fog.width, fog.height).fill(FOG_COLOR);
    this.dimmed.clear().rect(0, 0, fog.width, fog.height).fill({
      color: FOG_COLOR,
      alpha: PENUMBRA_ALPHA,
    });
    drawOpenings(this.darkMask, fog, fog.dim);
    drawOpenings(this.dimMask, fog, fog.bright);
  }
}

// What the mask draws is where the fog is cut away: the areas seen and the viewer's tokens.
function drawOpenings(mask: Graphics, fog: FogView, areas: FogView['dim']): void {
  mask.clear();
  for (const area of areas) {
    if (area.length < 3) continue;
    mask.poly(area.flatMap(({ x, y }) => [x, y])).fill(0xffffff);
  }
  for (const hole of fog.holes) mask.rect(hole.x, hole.y, hole.width, hole.height).fill(0xffffff);
}
