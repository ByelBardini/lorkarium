import { Container, Graphics, Text } from 'pixi.js';
import type { BarColorDto, TokenSideDto } from '@lorkarium/contracts';
import type { GhostView, TokenView } from './board-view';
import { CELL_WORLD_SIZE, type Point } from './camera';

// Design system tokens (client/src/index.css): the canvas cannot read CSS variables.
const DISC_COLOR = 0x1b1f25;
const TEXT_COLOR = 0xeae5da;
const GOLD_COLOR = 0xc5a46d;
const NEGATIVE_COLOR = 0xb5654f;
const BAR_TRACK_COLOR = 0x262b33;
const RING_COLOR: Readonly<Record<TokenSideDto, number>> = {
  ally: 0xd5d0c4,
  enemy: 0xb5654f,
  neutral: 0x8a9bb8,
};
const BAR_COLOR: Readonly<Record<BarColorDto, number>> = {
  gold: 0xc5a46d,
  steel: 0x8a9bb8,
  ember: 0xb5654f,
  moss: 0x7f9a7a,
  ash: 0xa9a497,
};
const MOVE_ANIMATION_MS = 150;

type TokenSprite = Readonly<{
  root: Container;
  shape: Graphics;
  label: Text;
}> & { view: TokenView; from: Point; to: Point; startedMs: number };

/** The tokens on the canvas: one `Container` per token, kept by id so a change redraws only that
 *  token (spec §14, rendering risk). Positions are world px of the token's top-left corner. */
export class PixiTokenLayer {
  readonly container = new Container();
  private readonly sprites = new Map<string, TokenSprite>();
  private readonly ghost = new Graphics();
  private dragging: string | null = null;

  constructor(private readonly reducedMotion: () => boolean) {
    this.container.addChild(this.ghost);
  }

  sync(tokens: readonly TokenView[], ghost: GhostView | null, nowMs: number): void {
    const alive = new Set(tokens.map(({ id }) => id));
    for (const [id, sprite] of this.sprites) {
      if (alive.has(id)) continue;
      sprite.root.destroy({ children: true });
      this.sprites.delete(id);
    }
    for (const view of tokens) this.place(view, nowMs);
    this.drawGhost(ghost);
  }

  /** The topmost token under a world point. */
  tokenAt(world: Point): TokenView | null {
    const views = [...this.sprites.values()].map(({ view }) => view).reverse();
    return views.find((view) => contains(view, world)) ?? null;
  }

  /** Follows the pointer while a token is dragged (centered on it). */
  drag(tokenId: string, world: Point): void {
    const sprite = this.sprites.get(tokenId);
    if (!sprite) return;
    this.dragging = tokenId;
    const half = (sprite.view.size * CELL_WORLD_SIZE) / 2;
    sprite.root.position.set(world.x - half, world.y - half);
  }

  /** Back to the confirmed cell: the ghost or the confirmed event shows where it goes. */
  release(): void {
    const sprite = this.dragging ? this.sprites.get(this.dragging) : undefined;
    this.dragging = null;
    if (sprite) sprite.root.position.set(sprite.to.x, sprite.to.y);
  }

  /** Moves each token a step along its 150 ms glide; call from the ticker. */
  animate(nowMs: number): void {
    for (const [id, sprite] of this.sprites) {
      if (id === this.dragging) continue;
      const progress = Math.min(1, (nowMs - sprite.startedMs) / MOVE_ANIMATION_MS);
      const x = sprite.from.x + (sprite.to.x - sprite.from.x) * progress;
      const y = sprite.from.y + (sprite.to.y - sprite.from.y) * progress;
      sprite.root.position.set(x, y);
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.sprites.clear();
  }

  private place(view: TokenView, nowMs: number): void {
    const target = cornerOf(view);
    const known = this.sprites.get(view.id);
    if (!known) return this.add(view, target, nowMs);
    const moved = known.to.x !== target.x || known.to.y !== target.y;
    if (moved) {
      known.from = this.reducedMotion() ? target : { x: known.root.x, y: known.root.y };
      known.to = target;
      known.startedMs = nowMs;
    }
    known.view = view;
    drawToken(known);
  }

  private add(view: TokenView, at: Point, nowMs: number): void {
    const root = new Container();
    const shape = new Graphics();
    const label = new Text({
      text: '',
      style: {
        fontFamily: 'Hanken Grotesk Variable, sans-serif',
        fontWeight: '600',
        fill: TEXT_COLOR,
      },
    });
    label.anchor.set(0.5);
    root.addChild(shape, label);
    root.position.set(at.x, at.y);
    this.container.addChild(root);
    const sprite: TokenSprite = { root, shape, label, view, from: at, to: at, startedMs: nowMs };
    this.sprites.set(view.id, sprite);
    drawToken(sprite);
  }

  private drawGhost(ghost: GhostView | null): void {
    this.ghost.clear();
    if (!ghost) return;
    const size = ghost.size * CELL_WORLD_SIZE;
    const corner = { x: ghost.col * CELL_WORLD_SIZE, y: ghost.row * CELL_WORLD_SIZE };
    this.ghost
      .circle(corner.x + size / 2, corner.y + size / 2, size * 0.42)
      .stroke({ width: 2, color: GOLD_COLOR, alpha: 0.6 });
  }
}

function drawToken({ shape, label, view }: TokenSprite): void {
  const size = view.size * CELL_WORLD_SIZE;
  const center = size / 2;
  const radius = size * 0.42;
  shape.clear().circle(center, center, radius).fill(DISC_COLOR);
  shape.circle(center, center, radius).stroke({ width: 3, color: RING_COLOR[view.ring] });
  if (view.onTurn) {
    shape.circle(center, center, radius + 9).stroke({ width: 4, color: GOLD_COLOR });
  }
  if (view.selected) {
    shape.circle(center, center, radius + 5).stroke({ width: 2, color: GOLD_COLOR });
  }
  drawBar(shape, view, size);
  drawMarks(shape, view, size);
  label.text = view.initials;
  label.style.fontSize = Math.round(size * 0.3);
  label.position.set(center, center);
}

function drawBar(shape: Graphics, view: TokenView, size: number): void {
  if (!view.bar) return;
  const width = size * 0.8;
  const left = (size - width) / 2;
  const top = size - 8;
  shape.rect(left, top, width, 5).fill(BAR_TRACK_COLOR);
  shape.rect(left, top, width * view.bar.fraction, 5).fill(BAR_COLOR[view.bar.color]);
  if (view.bar.state === 'negative') shape.rect(left, top, 2, 5).fill(NEGATIVE_COLOR);
}

// Small squares at the top right, one per condition (up to 3), and a "+" when there are more.
function drawMarks(shape: Graphics, view: TokenView, size: number): void {
  view.marks.forEach((tone, index) => {
    const left = size - 12 - index * 11;
    shape.rect(left, 2, 8, 8).fill(tone === 'benefit' ? GOLD_COLOR : NEGATIVE_COLOR);
  });
  if (!view.moreMarks) return;
  const left = size - 12 - view.marks.length * 11;
  shape
    .moveTo(left, 6)
    .lineTo(left + 8, 6)
    .moveTo(left + 4, 2)
    .lineTo(left + 4, 10);
  shape.stroke({ width: 2, color: TEXT_COLOR });
}

function cornerOf(view: TokenView): Point {
  return { x: view.col * CELL_WORLD_SIZE, y: view.row * CELL_WORLD_SIZE };
}

function contains(view: TokenView, world: Point): boolean {
  const corner = cornerOf(view);
  const size = view.size * CELL_WORLD_SIZE;
  return (
    world.x >= corner.x &&
    world.x < corner.x + size &&
    world.y >= corner.y &&
    world.y < corner.y + size
  );
}
