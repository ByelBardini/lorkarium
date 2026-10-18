import { Container, Graphics, Text, type Texture } from 'pixi.js';
import type { BarColorDto, TokenLayerDto, TokenSideDto } from '@lorkarium/contracts';
import { facingVector } from '@lorkarium/game-core';
import type { GhostView, TokenView } from './board-view';
import { CELL_WORLD_SIZE, type Point, zoomProofTextResolution } from './camera';
import { PixiConditionMarks } from './pixi-condition-marks';
import { PixiTokenArt, ROUND_RADIUS_SHARE } from './pixi-token-art';
import type { PixiTextureCache } from './pixi-texture-cache';

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
  disc: Graphics;
  art: PixiTokenArt;
  shape: Graphics;
  label: Text;
  marks: PixiConditionMarks;
}> & { view: TokenView; from: Point; to: Point; startedMs: number };

const FACING_MARK_LENGTH = 7;
const FACING_MARK_HALF_WIDTH = 5;

/** The tokens on the canvas: one `Container` per token, kept by id so a change redraws only that
 *  token (spec §14, rendering risk), inside one `Container` per layer (Fundo under Objetos under
 *  Tokens). Positions are world px of the token's top-left corner. */
export class PixiTokenLayer {
  readonly container = new Container();
  private readonly layers: Readonly<Record<TokenLayerDto, Container>> = {
    background: new Container(),
    objects: new Container(),
    tokens: new Container(),
  };
  private readonly sprites = new Map<string, TokenSprite>();
  private readonly ghost = new Graphics();
  private dragging: string | null = null;
  private drawn: readonly TokenView[] = [];

  /** `beneath`: what each layer draws under its tokens (the drawings of that layer); `textures`:
   *  where the token images come from (without it, every token is the initials disc). */
  constructor(
    private readonly reducedMotion: () => boolean,
    beneath?: Readonly<Record<TokenLayerDto, Container>>,
    private readonly textures?: PixiTextureCache,
  ) {
    const { background, objects, tokens } = this.layers;
    if (beneath) {
      for (const layer of ['background', 'objects', 'tokens'] as const) {
        this.layers[layer].addChild(beneath[layer]);
      }
    }
    this.container.addChild(background, objects, tokens, this.ghost);
  }

  sync(tokens: readonly TokenView[], ghosts: readonly GhostView[], nowMs: number): void {
    this.drawn = tokens;
    const alive = new Set(tokens.map(({ id }) => id));
    for (const [id, sprite] of this.sprites) {
      if (alive.has(id)) continue;
      sprite.root.destroy({ children: true });
      this.sprites.delete(id);
    }
    for (const view of tokens) this.place(view, nowMs);
    this.drawGhosts(ghosts);
  }

  /** The topmost token of the active layer under a world point: the others cannot be taken. */
  tokenAt(world: Point): TokenView | null {
    const topFirst = [...this.drawn].reverse();
    return topFirst.find((view) => view.pickable && contains(view, world)) ?? null;
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
    if (known.view.layer !== view.layer) this.layers[view.layer].addChild(known.root);
    known.view = view;
    this.draw(known);
  }

  private draw(sprite: TokenSprite): void {
    const art = sprite.view.art;
    drawToken(sprite, art ? (this.textures?.textureOf(art.url) ?? null) : null);
  }

  private add(view: TokenView, at: Point, nowMs: number): void {
    const root = new Container();
    const shape = new Graphics();
    const label = new Text({
      text: '',
      resolution: zoomProofTextResolution(globalThis.devicePixelRatio),
      style: {
        fontFamily: 'Hanken Grotesk Variable, sans-serif',
        fontWeight: '600',
        fill: TEXT_COLOR,
      },
    });
    label.anchor.set(0.5);
    const marks = new PixiConditionMarks();
    const disc = new Graphics();
    const art = new PixiTokenArt();
    root.addChild(disc, art.container, shape, label, marks.container);
    root.position.set(at.x, at.y);
    this.layers[view.layer].addChild(root);
    const sprite: TokenSprite = {
      root,
      disc,
      art,
      shape,
      label,
      marks,
      view,
      from: at,
      to: at,
      startedMs: nowMs,
    };
    this.sprites.set(view.id, sprite);
    this.draw(sprite);
  }

  private drawGhosts(ghosts: readonly GhostView[]): void {
    this.ghost.clear();
    for (const ghost of ghosts) {
      const size = ghost.size * CELL_WORLD_SIZE;
      const corner = { x: ghost.col * CELL_WORLD_SIZE, y: ghost.row * CELL_WORLD_SIZE };
      this.ghost
        .circle(corner.x + size / 2, corner.y + size / 2, size * 0.42)
        .stroke({ width: 2, color: GOLD_COLOR, alpha: 0.6 });
    }
  }
}

// With its image loaded the token is the image (square: no disc; round: cropped with the side
// ring); until then, or when it fails, the initials disc. The facing mark only when the view asks.
function drawToken(sprite: TokenSprite, texture: Texture | null): void {
  const { disc, art, shape, label, marks, view } = sprite;
  const size = view.size * CELL_WORLD_SIZE;
  const center = size / 2;
  const radius = size * ROUND_RADIUS_SHARE;
  const image = texture && view.art;
  const square = Boolean(image && view.art?.frame === 'square');
  disc.clear();
  if (!image) disc.circle(center, center, radius).fill(DISC_COLOR);
  art.draw(view.art, texture, size, view.facing);
  shape.clear();
  if (!square)
    shape.circle(center, center, radius).stroke({ width: 3, color: RING_COLOR[view.ring] });
  drawOutlines(shape, view, size, square);
  drawBar(shape, view, size);
  if (view.facingMark) drawFacingMark(shape, view.facing, center, radius);
  marks.draw(view, size);
  label.visible = !image;
  label.text = view.initials;
  label.style.fontSize = Math.round(size * 0.3);
  label.position.set(center, center);
}

// The turn and selection rings follow the token's outline: a square image gets square ones.
function drawOutlines(shape: Graphics, view: TokenView, size: number, square: boolean): void {
  const outline = (gap: number, width: number): void => {
    if (square) shape.rect(-gap, -gap, size + gap * 2, size + gap * 2);
    else shape.circle(size / 2, size / 2, size * ROUND_RADIUS_SHARE + gap);
    shape.stroke({ width, color: GOLD_COLOR });
  };
  if (view.onTurn) outline(9, 4);
  if (view.selected) outline(5, 2);
}

// A small triangle on the border pointing where the token looks; it stays when nothing turns.
function drawFacingMark(shape: Graphics, facing: number, center: number, radius: number): void {
  const ahead = facingVector(facing);
  const side = { x: -ahead.y, y: ahead.x };
  const base = { x: center + ahead.x * radius, y: center + ahead.y * radius };
  const tip = {
    x: base.x + ahead.x * FACING_MARK_LENGTH,
    y: base.y + ahead.y * FACING_MARK_LENGTH,
  };
  shape
    .poly([
      tip.x,
      tip.y,
      base.x + side.x * FACING_MARK_HALF_WIDTH,
      base.y + side.y * FACING_MARK_HALF_WIDTH,
      base.x - side.x * FACING_MARK_HALF_WIDTH,
      base.y - side.y * FACING_MARK_HALF_WIDTH,
    ])
    .fill(GOLD_COLOR);
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
