import { Container, Graphics, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js';
import type { Point } from './camera';
import type { FogRect, FogView } from './fog-view';

const FOG_COLOR = 0x000000;
const PENUMBRA_ALPHA = 0.55;
// A scene of 100 cells at 64 px is 6400 px a side (~164 MB in RGBA) and past the GPU's texture
// limit: the openings are drawn smaller, and a blurred edge does not show in the fog.
const OPENINGS_SIDE_MAX = 2048;

type FogAreas = FogView['dim'];

/** The fog on the canvas: two sheets of the scene's size, an opaque one cut (inverse mask) by the
 *  dim openings and one at 55% cut by the bright ones. Each sheet's openings are a texture: the
 *  areas the eyes see by their own range, the viewer's own tokens, and what the lights light
 *  masked by the eyes' lines of sight. Above the board and its tokens, under the ruler, the
 *  handles and the walls. Redrawn only when the fog's key changes. Proven by the e2e.
 *
 *  Example: `fog.sync(view.fog, app.renderer)` */
export class PixiFogLayer {
  readonly container = new Container();
  private readonly dark = new Graphics();
  private readonly dimmed = new Graphics();
  private readonly darkOpenings = new FogOpenings();
  private readonly dimOpenings = new FogOpenings();
  private key: string | null = null;

  constructor() {
    const { darkOpenings, dimOpenings } = this;
    this.container.addChild(darkOpenings.sprite, dimOpenings.sprite, this.dimmed, this.dark);
    this.dark.setMask({ mask: darkOpenings.sprite, inverse: true, channel: 'alpha' });
    this.dimmed.setMask({ mask: dimOpenings.sprite, inverse: true, channel: 'alpha' });
  }

  sync(fog: FogView | null, renderer: Renderer): void {
    this.container.visible = fog !== null;
    if (!fog || fog.key === this.key) return;
    this.key = fog.key;
    this.dark.clear().rect(0, 0, fog.width, fog.height).fill(FOG_COLOR);
    this.dimmed.clear().rect(0, 0, fog.width, fog.height).fill({
      color: FOG_COLOR,
      alpha: PENUMBRA_ALPHA,
    });
    this.darkOpenings.draw(renderer, fog, fog.dim, fog.lit.dim);
    this.dimOpenings.draw(renderer, fog, fog.bright, fog.lit.bright);
  }

  destroy(): void {
    this.darkOpenings.destroy();
    this.dimOpenings.destroy();
  }
}

// One sheet's openings, drawn into a texture read by its alpha: (own ∪ holes) ∪ (lit ∩ sight lines).
class FogOpenings {
  readonly sprite = new Sprite(Texture.EMPTY);
  private readonly drawing = new Container();
  private readonly own = new Graphics();
  private readonly lit = new Graphics();
  private readonly sightLines = new Graphics();
  private texture: RenderTexture | null = null;

  constructor() {
    this.drawing.addChild(this.own, this.lit, this.sightLines);
    this.lit.mask = this.sightLines;
  }

  draw(renderer: Renderer, fog: FogView, own: FogAreas, lit: FogAreas): void {
    const target = this.textureOf(fog.width, fog.height);
    fillAreas(this.own.clear(), own);
    fillHoles(this.own, fog.holes);
    fillAreas(this.lit.clear(), lit);
    fillAreas(this.sightLines.clear(), fog.sightLines);
    renderer.render({ container: this.drawing, target, clear: true });
    this.sprite.texture = target;
  }

  destroy(): void {
    this.texture?.destroy(true);
    this.texture = null;
  }

  // A new scene size makes a new texture; the old one is freed.
  private textureOf(width: number, height: number): RenderTexture {
    if (this.texture?.width === width && this.texture.height === height) return this.texture;
    this.texture?.destroy(true);
    const resolution = Math.min(1, OPENINGS_SIDE_MAX / Math.max(width, height));
    this.texture = RenderTexture.create({ width, height, resolution });
    return this.texture;
  }
}

function fillAreas(graphics: Graphics, areas: FogAreas): void {
  for (const area of areas) {
    if (area.length < 3) continue;
    graphics.poly(area.flatMap(({ x, y }: Point) => [x, y])).fill(0xffffff);
  }
}

function fillHoles(graphics: Graphics, holes: readonly FogRect[]): void {
  for (const hole of holes) graphics.rect(hole.x, hole.y, hole.width, hole.height).fill(0xffffff);
}
