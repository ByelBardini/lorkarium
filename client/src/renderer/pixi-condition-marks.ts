import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { conditionColorNumberOf } from '@/lib/condition-colors';
import { conditionIconUrlOf } from '@/lib/condition-icons';
import { zoomProofTextResolution } from './camera';
import { conditionStripOf, type ConditionStrip, type StripIcon } from './condition-strip';
import { dashedRingArcs } from './dashed-ring';
import type { PixiTextureCache } from './pixi-texture-cache';
import { tokenWorldRect } from './token-box';
import type { TokenView } from './token-view';

// Design system tokens (client/src/index.css): the canvas cannot read CSS variables.
const BADGE_COLOR = 0x1b1f25;
const TEXT_COLOR = 0xeae5da;
const ENDING_RING_COLOR = 0xeae5da;
const ICON_SHARE_OF_BADGE = 0.65;
const NO_STRIP: ConditionStrip = { band: 'none', height: 0 };
const NO_ART: BadgeArt = { image: null, glyph: null };
const RING_WIDTH = 1.5;
// An image covers the middle, so an incapacitating one is told apart by a ring twice as thick.
const HEAVY_RING_WIDTH = 3;

/** Where the condition images and icons come from: a texture, or `null` while it loads (or
 *  failed). */
export type ConditionTextures = Pick<PixiTextureCache, 'textureOf'>;

// One per icon of the strip, in its order: the master's image ready to draw, else the white icon
// to tint (`null` while it loads: the disc alone).
type BadgeArt = Readonly<{ image: Texture | null; glyph: Texture | null }>;
type BadgeImages = readonly BadgeArt[];

/** The condition strip of one token, hung under its cell: dots from afar, badges, badges with
 *  their rounds up close, and "+N". Lives in the strips layer (over the tokens of its layer, so
 *  the neighbor below never covers it); the caller keeps `container` on the token's corner.
 *  Rebuilt only when the strip changes (an image that becomes ready included); the dots only
 *  rescale with the zoom. A condition with an image shows its glyph until `textures` has it.
 *
 *  Example: `const strip = marks.draw(view, zoom); nameTag.draw(view, visible, strip.height)` */
export class PixiConditionMarks {
  readonly container = new Container();
  private readonly dots = new Container();
  private drawnKey = '';

  constructor(private readonly textures?: ConditionTextures) {}

  draw(view: TokenView, zoom: number): ConditionStrip {
    const strip = stripOf(view, zoom);
    this.dots.scale.set(1 / zoom);
    const images = this.imagesOf(strip);
    const key = stripKey(strip, images);
    if (key === this.drawnKey) return strip;
    this.drawnKey = key;
    for (const child of this.container.removeChildren()) {
      if (child !== this.dots) child.destroy({ children: true });
    }
    for (const child of this.dots.removeChildren()) child.destroy();
    if (strip.band === 'dots') this.drawDots(strip, tokenWorldRect(view).width);
    if (strip.band === 'icons' || strip.band === 'detailed') this.drawIcons(strip, images);
    return strip;
  }

  // From afar the dots never ask: an image or an icon only loads once a badge can show it. The
  // icon is one white file per key, whatever the color: the tint paints it.
  private imagesOf(strip: ConditionStrip): BadgeImages {
    if (strip.band !== 'icons' && strip.band !== 'detailed') return [];
    return strip.icons.map(({ icon, imageUrl }) => {
      const image = imageUrl ? this.textureAt(imageUrl) : null;
      return { image, glyph: image ? null : this.textureAt(conditionIconUrlOf(icon)) };
    });
  }

  private textureAt(url: string): Texture | null {
    return this.textures?.textureOf(url) ?? null;
  }

  private drawDots(strip: Extract<ConditionStrip, { band: 'dots' }>, width: number): void {
    const radius = strip.dotSize / 2;
    for (const { tone, color, offsetX } of strip.dots) {
      const fill = conditionColorNumberOf(color, tone);
      this.dots.addChild(new Graphics().circle(offsetX, radius, radius).fill(fill));
    }
    this.dots.position.set(width / 2, strip.top);
    this.container.addChild(this.dots);
  }

  private drawIcons(
    strip: Extract<ConditionStrip, { band: 'icons' | 'detailed' }>,
    images: BadgeImages,
  ): void {
    const radius = strip.iconSize / 2;
    const y = strip.top + radius;
    strip.icons.forEach((icon, index) => {
      this.container.addChild(badge(icon, radius, y, images[index] ?? NO_ART));
    });
    if (strip.more) this.container.addChild(moreBadge(strip.more.count, radius, strip.more.x, y));
  }
}

function stripOf(view: TokenView, zoom: number): ConditionStrip {
  if (view.silhouette || view.conditions.length === 0) return NO_STRIP;
  const { width, height } = tokenWorldRect(view);
  return conditionStripOf({ width, height, conditions: view.conditions, zoom });
}

// The textures' uids: the disc alone (`-`) gets its glyph, and the glyph gives way to the image,
// the moment each is ready.
function stripKey(strip: ConditionStrip, images: BadgeImages): string {
  if (strip.band === 'none') return 'none';
  if (strip.band === 'dots') {
    return `dots|${strip.top}|${strip.dots.map((d) => `${d.tone}:${d.color}`).join()}`;
  }
  const icons = strip.icons.map(
    (i, index) =>
      `${i.icon}:${i.tone}:${i.color}:${i.x}:${i.rounds}:${i.stacks}:${i.ending}:${artKey(images[index])}`,
  );
  return `${strip.band}|${strip.top}|${strip.iconSize}|${strip.more?.count}|${icons.join()}`;
}

function artKey(art: BadgeArt | undefined): string {
  return `${art?.image?.uid ?? '-'}/${art?.glyph?.uid ?? '-'}`;
}

// The image or the glyph in its disc; the last round gets a light dashed ring around it.
function badge(mark: StripIcon, radius: number, y: number, art: BadgeArt): Container {
  const root = new Container();
  if (art.image) root.addChild(imageDisc(mark, radius, art.image));
  else root.addChild(...glyphDisc(mark, radius, art.glyph));
  if (mark.ending) root.addChild(endingRing(radius + 2.5));
  if (mark.rounds !== null) root.addChild(roundsLabel(mark.rounds, radius));
  if (mark.stacks !== null) root.addChild(stacksLabel(mark.stacks, radius));
  root.position.set(mark.x, y);
  return root;
}

// Incapacitating is a filled badge in its color with a dark glyph; the others a dark badge ringed
// and drawn in their color. The glyph is the white icon tinted: a texture, so the holes of the
// Game-icons come out right (Graphics.svg triangulates them wrong).
function glyphDisc(mark: StripIcon, radius: number, glyph: Texture | null): Container[] {
  const filled = mark.tone === 'incapacitating';
  const color = conditionColorNumberOf(mark.color, mark.tone);
  const disc = new Graphics().circle(0, 0, radius);
  if (filled) disc.fill(color);
  else disc.fill({ color: BADGE_COLOR, alpha: 0.92 }).stroke({ width: RING_WIDTH, color });
  if (!glyph) return [disc];
  const icon = new Sprite({ texture: glyph, anchor: 0.5, tint: filled ? BADGE_COLOR : color });
  icon.setSize(radius * 2 * ICON_SHARE_OF_BADGE);
  return [disc, icon];
}

// The server keeps a condition image square, so stretched over the circle (`local`) it is the
// round cut without a mask: each mask would break the GPU batch (performance.md). The dark disc
// shows through a transparent PNG.
function imageDisc(mark: StripIcon, radius: number, image: Texture): Graphics {
  const color = conditionColorNumberOf(mark.color, mark.tone);
  const width = mark.tone === 'incapacitating' ? HEAVY_RING_WIDTH : RING_WIDTH;
  return new Graphics()
    .circle(0, 0, radius)
    .fill({ color: BADGE_COLOR, alpha: 0.92 })
    .circle(0, 0, radius)
    .fill({ texture: image, textureSpace: 'local' })
    .stroke({ width, color });
}

function endingRing(radius: number): Graphics {
  const ring = new Graphics();
  for (const { start, end } of dashedRingArcs(radius, 2.5, 2)) {
    ring.moveTo(Math.cos(start) * radius, Math.sin(start) * radius).arc(0, 0, radius, start, end);
  }
  return ring.stroke({ width: 1.25, color: ENDING_RING_COLOR });
}

// Bottom right of the badge, outlined so it reads over the glyph and over the map.
function roundsLabel(rounds: number, radius: number): Text {
  return cornerLabel(String(rounds), radius, 0.7);
}

// `corner`: the share of the radius off the center, on both axes (negative = up and left).
function cornerLabel(text: string, radius: number, corner: number): Text {
  const label = textOf(text, Math.round(radius * 0.8));
  label.style.stroke = { color: BADGE_COLOR, width: 3 };
  label.anchor.set(0.5);
  label.position.set(radius * corner, radius * corner);
  return label;
}

// Top left of the badge, opposite the rounds and outlined the same way.
function stacksLabel(stacks: number, radius: number): Text {
  return cornerLabel(String(stacks), radius, -0.7);
}

// A dark disc like the badges' so the count reads over the map and the neighbor's ring.
function moreBadge(count: number, radius: number, x: number, y: number): Container {
  const root = new Container();
  const disc = new Graphics().circle(0, 0, radius).fill({ color: BADGE_COLOR, alpha: 0.92 });
  const label = textOf(`+${count}`, Math.round(radius * (count > 9 ? 0.9 : 1.1)));
  label.anchor.set(0.5);
  root.addChild(disc, label);
  root.position.set(x, y);
  return root;
}

function textOf(text: string, fontSize: number): Text {
  return new Text({
    text,
    resolution: zoomProofTextResolution(globalThis.devicePixelRatio),
    style: {
      fontFamily: 'Hanken Grotesk Variable, sans-serif',
      fontWeight: '600',
      fontSize,
      fill: TEXT_COLOR,
    },
  });
}
