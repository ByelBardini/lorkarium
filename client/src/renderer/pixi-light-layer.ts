import { Graphics } from 'pixi.js';
import type { Point } from './camera';
import type { LightAreas } from './light-areas';
import type { LightView } from './light-view';

// Design system colors (client/src/index.css): the canvas cannot read CSS variables.
const GOLD = 0xc5a46d;
const ASH = 0xa9a497;
const PANEL = 0x0c0e11;

const ICON_SCREEN_PX = 16;
const HALO_SCREEN_PX = 2;
const OUTLINE_SCREEN_PX = 1.5;
const FAINT_ALPHA = 0.35;
const DIM_ALPHA = 0.12;
const BRIGHT_ALPHA = 0.22;

/** The master's map lights on the canvas, above the fog beside the wall lines: a flame icon of
 *  16 px of screen whatever the zoom (in the color of the light when lit, gold if neutral; ash
 *  out; a gold halo when selected; faint without the lights tool) and, with the tool, what each
 *  lit light lights in its color (dim at 12%, bright at 22%, outlined). Redrawn on each draw and camera change. Proven by the e2e.
 *
 *  Example: `world.addChild(lights.areas, lights.icons); lights.draw(view.lights, camera.zoom)` */
export class PixiLightLayer {
  readonly areas = new Graphics();
  readonly icons = new Graphics();

  draw(lights: readonly LightView[], zoom: number): void {
    this.areas.clear();
    this.icons.clear();
    for (const light of lights) {
      if (light.areas) drawAreas(this.areas, light.areas, light.color ?? GOLD, zoom);
      drawIcon(this.icons, light, zoom);
    }
  }
}

function drawAreas(graphics: Graphics, areas: LightAreas, color: number, zoom: number): void {
  const outline = { width: OUTLINE_SCREEN_PX / zoom, color, alpha: 0.6 };
  if (areas.dim.length >= 3) {
    graphics.poly(flat(areas.dim)).fill({ color, alpha: DIM_ALPHA }).stroke(outline);
  }
  if (areas.bright.length >= 3) {
    graphics.poly(flat(areas.bright)).fill({ color, alpha: BRIGHT_ALPHA }).stroke(outline);
  }
}

// A teardrop flame on a dark disc, so it reads over any map.
function drawIcon(graphics: Graphics, light: LightView, zoom: number): void {
  const alpha = light.emphasis === 'faint' ? FAINT_ALPHA : 1;
  const scale = ICON_SCREEN_PX / 16 / zoom;
  const { x, y } = light;
  graphics.circle(x, y, 9 * scale).fill({ color: PANEL, alpha: 0.8 * alpha });
  graphics
    .moveTo(x, y - 7 * scale)
    .bezierCurveTo(x + 6 * scale, y - scale, x + 5 * scale, y + 6 * scale, x, y + 6 * scale)
    .bezierCurveTo(x - 5 * scale, y + 6 * scale, x - 6 * scale, y - scale, x, y - 7 * scale)
    .fill({ color: light.lit ? (light.color ?? GOLD) : ASH, alpha });
  if (!light.selected) return;
  graphics.circle(x, y, 11 * scale).stroke({ width: HALO_SCREEN_PX / zoom, color: GOLD, alpha });
}

function flat(points: readonly Point[]): number[] {
  return points.flatMap(({ x, y }) => [x, y]);
}
