import { Container, Graphics, GraphicsContext, Text } from 'pixi.js';
import type { ConditionToneDto } from '@lorkarium/contracts';
import { conditionIconSvg } from '@/lib/condition-icons';
import type { ConditionMarkView, TokenView } from './board-view';
import { CELL_WORLD_SIZE, zoomProofTextResolution } from './camera';

// Design system tokens (client/src/index.css): the canvas cannot read CSS variables.
const BADGE_COLOR = 0x1b1f25;
const TEXT_COLOR = 0xeae5da;
const TONE_COLOR: Readonly<Record<ConditionToneDto, number>> = {
  benefit: 0xc5a46d,
  harm: 0xb5654f,
};
/** Badge radius grows with the token's side (in cells) to the power 0.75: a 3×3 token gets
 *  marks about 2.3 times as large, not 3. A one-cell token keeps the floor so the marks stay in
 *  its corner instead of covering the cell. */
const BADGE_RADIUS_PER_CELL = 5.76;
const MIN_BADGE_RADIUS = 6.5;
const ICON_SHARE_OF_BADGE = 1.3;
const LUCIDE_VIEWBOX = 24;

// One parsed SVG per icon and tone, shared by every token that shows it.
const iconContexts = new Map<string, GraphicsContext>();

/** The condition icons of one token, in round badges along its top-right corner, and "+N" for
 *  the rest. Rebuilt only when the marks or the token's width change.
 *
 *  Example: `marks.draw(view, view.width * CELL_WORLD_SIZE)` */
export class PixiConditionMarks {
  readonly container = new Container();
  private drawnKey = '';

  draw(view: TokenView, size: number): void {
    const key = marksKey(view, size);
    if (key === this.drawnKey) return;
    this.drawnKey = key;
    for (const child of this.container.removeChildren()) child.destroy({ children: true });
    const radius = Math.max(
      MIN_BADGE_RADIUS,
      BADGE_RADIUS_PER_CELL * (size / CELL_WORLD_SIZE) ** 0.75,
    );
    view.marks.forEach((mark, index) => {
      this.container.addChild(badge(mark, radius, badgeCenterX(size, radius, index), radius));
    });
    if (view.moreMarks === 0) return;
    const x = badgeCenterX(size, radius, view.marks.length);
    this.container.addChild(moreBadge(view.moreMarks, radius, x));
  }
}

function marksKey(view: TokenView, size: number): string {
  const marks = view.marks.map(({ icon, tone }) => `${icon}:${tone}`).join(',');
  return `${size}|${view.moreMarks}|${marks}`;
}

// Right to left from the corner, each badge just clear of the one before.
function badgeCenterX(size: number, radius: number, index: number): number {
  return size - radius - index * (radius * 2 + 2);
}

function badge(mark: ConditionMarkView, radius: number, x: number, y: number): Container {
  const root = new Container();
  const disc = new Graphics()
    .circle(0, 0, radius)
    .fill({ color: BADGE_COLOR, alpha: 0.92 })
    .stroke({ width: 1.5, color: TONE_COLOR[mark.tone] });
  const icon = new Graphics(iconContext(mark));
  const iconSize = radius * ICON_SHARE_OF_BADGE;
  icon.scale.set(iconSize / LUCIDE_VIEWBOX);
  icon.position.set(-iconSize / 2, -iconSize / 2);
  root.addChild(disc, icon);
  root.position.set(x, y);
  return root;
}

function iconContext({ icon, tone }: ConditionMarkView): GraphicsContext {
  const key = `${icon}:${tone}`;
  const known = iconContexts.get(key);
  if (known) return known;
  const color = `#${TONE_COLOR[tone].toString(16).padStart(6, '0')}`;
  const context = new GraphicsContext().svg(conditionIconSvg(icon, color));
  iconContexts.set(key, context);
  return context;
}

// A dark disc like the icons' so the count reads over the token's ring, not on it.
function moreBadge(count: number, radius: number, x: number): Container {
  const root = new Container();
  const disc = new Graphics().circle(0, 0, radius).fill({ color: BADGE_COLOR, alpha: 0.92 });
  const label = new Text({
    text: `+${count}`,
    resolution: zoomProofTextResolution(globalThis.devicePixelRatio),
    style: {
      fontFamily: 'Hanken Grotesk Variable, sans-serif',
      fontWeight: '600',
      fontSize: Math.round(radius * (count > 9 ? 0.9 : 1.1)),
      fill: TEXT_COLOR,
    },
  });
  label.anchor.set(0.5);
  root.addChild(disc, label);
  root.position.set(x, radius);
  return root;
}
