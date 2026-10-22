import { Container, Graphics, GraphicsContext, Text } from 'pixi.js';
import type { ConditionToneDto } from '@lorkarium/contracts';
import { conditionIconSvg } from '@/lib/condition-icons';
import { zoomProofTextResolution } from './camera';
import { conditionStripOf, type ConditionStrip, type StripIcon } from './condition-strip';
import { dashedRingArcs } from './dashed-ring';
import { tokenWorldRect } from './token-box';
import type { ConditionMarkView, TokenView } from './token-view';

// Design system tokens (client/src/index.css): the canvas cannot read CSS variables.
const BADGE_COLOR = 0x1b1f25;
const TEXT_COLOR = 0xeae5da;
const COPPER = 0xb5654f;
const TONE_COLOR: Readonly<Record<ConditionToneDto, number>> = {
  benefit: 0xc5a46d,
  harm: COPPER,
  incapacitating: COPPER,
};
const ENDING_RING_COLOR = 0xeae5da;
const ICON_SHARE_OF_BADGE = 0.65;
const LUCIDE_VIEWBOX = 24;
const NO_STRIP: ConditionStrip = { band: 'none', height: 0 };

// One parsed SVG per icon and color, shared by every token that shows it.
const iconContexts = new Map<string, GraphicsContext>();

/** The condition strip of one token, hung under its cell: dots from afar, badges, badges with
 *  their rounds up close, and "+N". Lives in the strips layer (over the tokens of its layer, so
 *  the neighbor below never covers it); the caller keeps `container` on the token's corner.
 *  Rebuilt only when the strip changes; the dots only rescale with the zoom.
 *
 *  Example: `const strip = marks.draw(view, zoom); nameTag.draw(view, visible, strip.height)` */
export class PixiConditionMarks {
  readonly container = new Container();
  private readonly dots = new Container();
  private drawnKey = '';

  draw(view: TokenView, zoom: number): ConditionStrip {
    const strip = stripOf(view, zoom);
    this.dots.scale.set(1 / zoom);
    const key = stripKey(strip);
    if (key === this.drawnKey) return strip;
    this.drawnKey = key;
    for (const child of this.container.removeChildren()) {
      if (child !== this.dots) child.destroy({ children: true });
    }
    for (const child of this.dots.removeChildren()) child.destroy();
    if (strip.band === 'dots') this.drawDots(strip, tokenWorldRect(view).width);
    if (strip.band === 'icons' || strip.band === 'detailed') this.drawIcons(strip);
    return strip;
  }

  private drawDots(strip: Extract<ConditionStrip, { band: 'dots' }>, width: number): void {
    const radius = strip.dotSize / 2;
    for (const { tone, offsetX } of strip.dots) {
      this.dots.addChild(new Graphics().circle(offsetX, radius, radius).fill(TONE_COLOR[tone]));
    }
    this.dots.position.set(width / 2, strip.top);
    this.container.addChild(this.dots);
  }

  private drawIcons(strip: Extract<ConditionStrip, { band: 'icons' | 'detailed' }>): void {
    const radius = strip.iconSize / 2;
    const y = strip.top + radius;
    for (const icon of strip.icons) this.container.addChild(badge(icon, radius, y));
    if (strip.more) this.container.addChild(moreBadge(strip.more.count, radius, strip.more.x, y));
  }
}

function stripOf(view: TokenView, zoom: number): ConditionStrip {
  if (view.silhouette || view.conditions.length === 0) return NO_STRIP;
  const { width, height } = tokenWorldRect(view);
  return conditionStripOf({ width, height, conditions: view.conditions, zoom });
}

function stripKey(strip: ConditionStrip): string {
  if (strip.band === 'none') return 'none';
  if (strip.band === 'dots') return `dots|${strip.top}|${strip.dots.map((d) => d.tone).join()}`;
  const icons = strip.icons.map((i) => `${i.icon}:${i.tone}:${i.x}:${i.rounds}:${i.ending}`);
  return `${strip.band}|${strip.top}|${strip.iconSize}|${strip.more?.count}|${icons.join()}`;
}

// Incapacitating is a filled copper badge with a dark glyph; the others a dark badge ringed and
// drawn in their tone. The last round gets a light dashed ring around it.
function badge(mark: StripIcon, radius: number, y: number): Container {
  const root = new Container();
  const filled = mark.tone === 'incapacitating';
  const disc = new Graphics().circle(0, 0, radius);
  if (filled) disc.fill(COPPER);
  else
    disc
      .fill({ color: BADGE_COLOR, alpha: 0.92 })
      .stroke({ width: 1.5, color: TONE_COLOR[mark.tone] });
  const icon = new Graphics(iconContext(mark, filled ? BADGE_COLOR : TONE_COLOR[mark.tone]));
  const iconSize = radius * 2 * ICON_SHARE_OF_BADGE;
  icon.scale.set(iconSize / LUCIDE_VIEWBOX);
  icon.position.set(-iconSize / 2, -iconSize / 2);
  root.addChild(disc, icon);
  if (mark.ending) root.addChild(endingRing(radius + 2.5));
  if (mark.rounds !== null) root.addChild(roundsLabel(mark.rounds, radius));
  root.position.set(mark.x, y);
  return root;
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
  const label = textOf(String(rounds), Math.round(radius * 0.8));
  label.style.stroke = { color: BADGE_COLOR, width: 3 };
  label.anchor.set(0.5);
  label.position.set(radius * 0.7, radius * 0.7);
  return label;
}

function iconContext({ icon }: ConditionMarkView, color: number): GraphicsContext {
  const key = `${icon}:${color}`;
  const known = iconContexts.get(key);
  if (known) return known;
  const css = `#${color.toString(16).padStart(6, '0')}`;
  const context = new GraphicsContext().svg(conditionIconSvg(icon, css));
  iconContexts.set(key, context);
  return context;
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
