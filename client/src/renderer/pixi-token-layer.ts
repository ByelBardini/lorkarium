import { Container, Graphics, Text, type Texture } from 'pixi.js';
import { NO_PERF_PROBE, type PerfProbe } from '@/lib/perf-probe';
import type { BarColorDto, TokenLayerDto, TokenSideDto } from '@lorkarium/contracts';
import { facingVector } from '@lorkarium/game-core';
import type { GhostView, TokenView } from './board-view';
import { type Point, zoomProofTextResolution } from './camera';
import { PixiConditionMarks } from './pixi-condition-marks';
import { PixiTokenArt, ROUND_RADIUS_SHARE } from './pixi-token-art';
import type { PixiTextureCache } from './pixi-texture-cache';
import { showsNameTag } from './name-tag';
import { PixiNameTag } from './pixi-name-tag';
import { PixiTokenLook } from './pixi-token-look';
import { barSegments, type BarTone } from './token-bar';
import { tokenWorldRect } from './token-box';
import { defeatedCross } from './token-defeated';
import { tokenLookStyle } from './token-look';
import { tokenRedrawOf, type TokenRedraw } from './token-redraw';

// Design system tokens (client/src/index.css): the canvas cannot read CSS variables.
const DISC_COLOR = 0x1b1f25;
const TEXT_COLOR = 0xeae5da;
const GOLD_COLOR = 0xc5a46d;
const BAR_TRACK_COLOR = 0x262b33;
const BAR_OUTLINE_COLOR = 0x15130f;
// Below zero and above the maximum need hues no bar color has: crimson and bone.
const BAR_NEGATIVE_COLOR = 0xd6455d;
const BAR_OVER_COLOR = 0xeae5da;
const BAR_HEIGHT = 6;
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
const SILHOUETTE_COLOR = 0x000000;
const SILHOUETTE_ALPHA = 0.9;
const DEFEATED_COLOR = BAR_NEGATIVE_COLOR;
const DEFEATED_OUTLINE = 3;

type TokenSprite = Readonly<{
  root: Container;
  disc: Graphics;
  art: PixiTokenArt;
  shape: Graphics;
  label: Text;
  cross: Graphics;
  look: PixiTokenLook;
  marks: PixiConditionMarks;
  /** Over the tokens of its layer: the strip and the name plate, which hang under the cell. */
  overlay: Container;
  nameTag: PixiNameTag;
}> & { view: TokenView; from: Point; to: Point; startedMs: number; stripHeight: number };

/** Where the token images come from: a texture, or `null` while it loads (or failed). */
export type TokenTextures = Pick<PixiTextureCache, 'textureOf'>;

const WHOLE: TokenRedraw = { body: true, nameTag: true };
const STRIP_ONLY: TokenRedraw = { body: false, nameTag: false };

const FACING_MARK_LENGTH = 7;
const FACING_MARK_HALF_WIDTH = 5;

/** The tokens on the canvas: one `Container` per token, kept by id so a change redraws only that
 *  token, and of it only the part that changed (`tokenRedrawOf`; spec §14, rendering risk), inside
 *  one `Container` per layer (Fundo under Objetos under Tokens). Only the tokens gliding to a new
 *  cell are stepped by the ticker. Each layer has its condition strips and name plates right above its tokens: they hang
 *  under the cell, and the token below must not cover them. Positions are world px of the token's top-left
 *  corner. */
export class PixiTokenLayer {
  readonly container = new Container();
  private readonly layers: Readonly<Record<TokenLayerDto, Container>> = {
    background: new Container(),
    objects: new Container(),
    tokens: new Container(),
  };
  private readonly strips: Readonly<Record<TokenLayerDto, Container>> = {
    background: new Container(),
    objects: new Container(),
    tokens: new Container(),
  };
  private zoom = 1;
  private readonly sprites = new Map<string, TokenSprite>();
  private readonly ghost = new Graphics();
  private readonly gliding = new Set<string>();
  private dragging: string | null = null;
  private hovered: string | null = null;

  /** `beneath`: what goes over Fundo and Objetos and under the tokens of Tokens (the areas of
   *  effect and the drawings); `textures`: where the token images come from (without it, every
   *  token is the initials disc); `probe` counts each body redrawn (`token.redraw`). */
  constructor(
    private readonly reducedMotion: () => boolean,
    beneath?: Container,
    private readonly textures?: TokenTextures,
    private readonly probe: PerfProbe = NO_PERF_PROBE,
  ) {
    const { background, objects, tokens } = this.layers;
    if (beneath) tokens.addChild(beneath);
    const strips = this.strips;
    this.container.addChild(background, strips.background, objects, strips.objects);
    this.container.addChild(tokens, strips.tokens, this.ghost);
  }

  sync(tokens: readonly TokenView[], ghosts: readonly GhostView[], nowMs: number): void {
    const alive = new Set(tokens.map(({ id }) => id));
    for (const [id, sprite] of this.sprites) {
      if (alive.has(id)) continue;
      sprite.root.destroy({ children: true });
      sprite.overlay.destroy({ children: true });
      this.sprites.delete(id);
      this.gliding.delete(id);
    }
    for (const view of tokens) this.place(view, nowMs);
    this.drawGhosts(ghosts);
  }

  /** The strips follow the zoom (dots from afar, rounds up close); only a strip that changes
   *  is drawn again. Call on every camera change. */
  applyZoom(zoom: number): void {
    if (zoom === this.zoom) return;
    this.zoom = zoom;
    for (const sprite of this.sprites.values()) this.draw(sprite, STRIP_ONLY);
  }

  /** The token under the pointer shows its name (selected ones always do); `null` hides it.
   *  Only the two name plates are drawn again. */
  hover(tokenId: string | null): void {
    if (tokenId === this.hovered) return;
    const before = this.hovered ? this.sprites.get(this.hovered) : undefined;
    this.hovered = tokenId;
    const plateOnly = { hoverChanged: true };
    if (before) this.draw(before, tokenRedrawOf(before.view, before.view, plateOnly));
    const now = tokenId ? this.sprites.get(tokenId) : undefined;
    if (now) this.draw(now, tokenRedrawOf(now.view, now.view, plateOnly));
  }

  /** The texture of `url` arrived: only the tokens that show that image are drawn again. */
  refreshArt(url: string): void {
    for (const sprite of this.sprites.values()) {
      if (sprite.view.art?.url !== url) continue;
      this.draw(sprite, tokenRedrawOf(sprite.view, sprite.view, { artArrived: true }));
    }
  }

  /** How many tokens are gliding to their new cell (what `animate` steps). */
  glidingCount(): number {
    return this.gliding.size;
  }

  /** Follows the pointer while a token is dragged: `world` is where its center goes (the hold
   *  the press took is kept by the caller, `heldCenterOf`). */
  drag(tokenId: string, world: Point): void {
    const sprite = this.sprites.get(tokenId);
    if (!sprite) return;
    this.dragging = tokenId;
    const rect = tokenWorldRect(sprite.view);
    moveSprite(sprite, world.x - rect.width / 2, world.y - rect.height / 2);
  }

  /** Back to the confirmed cell: the ghost or the confirmed event shows where it goes. */
  release(): void {
    const sprite = this.dragging ? this.sprites.get(this.dragging) : undefined;
    this.dragging = null;
    if (sprite) moveSprite(sprite, sprite.to.x, sprite.to.y);
  }

  /** Moves each gliding token a step along its 150 ms glide; call from the ticker. A token that
   *  arrived leaves the set, so a still board costs nothing. */
  animate(nowMs: number): void {
    for (const id of this.gliding) {
      const sprite = this.sprites.get(id);
      if (!sprite || id === this.dragging) continue;
      const progress = Math.min(1, (nowMs - sprite.startedMs) / MOVE_ANIMATION_MS);
      const x = sprite.from.x + (sprite.to.x - sprite.from.x) * progress;
      const y = sprite.from.y + (sprite.to.y - sprite.from.y) * progress;
      moveSprite(sprite, x, y);
      if (progress === 1) this.gliding.delete(id);
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
    // The glide is for moves; a resize (the size changed) follows the handle at once.
    const resized = known.view.width !== view.width || known.view.height !== view.height;
    if (moved) this.glide(known, target, nowMs, this.reducedMotion() || resized);
    if (known.view.layer !== view.layer) {
      this.layers[view.layer].addChild(known.root);
      this.strips[view.layer].addChild(known.overlay);
    }
    const redraw = tokenRedrawOf(known.view, view);
    known.view = view;
    this.draw(known, redraw);
  }

  private glide(sprite: TokenSprite, target: Point, nowMs: number, instant: boolean): void {
    sprite.from = instant ? target : { x: sprite.root.x, y: sprite.root.y };
    sprite.to = target;
    sprite.startedMs = nowMs;
    if (instant && sprite.view.id !== this.dragging) moveSprite(sprite, target.x, target.y);
    if (!instant) this.gliding.add(sprite.view.id);
  }

  // The strip keeps its own key; the plate moves when the strip under the token changes height.
  private draw(sprite: TokenSprite, redraw: TokenRedraw): void {
    if (redraw.body) {
      this.probe.count('token.redraw');
      const art = sprite.view.art;
      drawToken(sprite, art ? (this.textures?.textureOf(art.url) ?? null) : null);
    }
    const { height } = sprite.marks.draw(sprite.view, this.zoom);
    if (!redraw.nameTag && height === sprite.stripHeight) return;
    sprite.stripHeight = height;
    sprite.nameTag.draw(sprite.view, showsNameTag(sprite.view, this.hovered), height);
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
    const nameTag = new PixiNameTag();
    const cross = new Graphics();
    const look = new PixiTokenLook();
    root.addChild(disc, art.container, shape, label, look.container, cross);
    const overlay = new Container();
    overlay.addChild(marks.container, nameTag.container);
    root.position.set(at.x, at.y);
    overlay.position.set(at.x, at.y);
    this.layers[view.layer].addChild(root);
    this.strips[view.layer].addChild(overlay);
    const sprite: TokenSprite = {
      root,
      disc,
      art,
      shape,
      label,
      cross,
      look,
      marks,
      overlay,
      nameTag,
      view,
      from: at,
      to: at,
      startedMs: nowMs,
      stripHeight: 0,
    };
    this.sprites.set(view.id, sprite);
    this.draw(sprite, WHOLE);
  }

  private drawGhosts(ghosts: readonly GhostView[]): void {
    this.ghost.clear();
    for (const ghost of ghosts) {
      const rect = tokenWorldRect(ghost);
      const radius = { x: rect.width * ROUND_RADIUS_SHARE, y: rect.height * ROUND_RADIUS_SHARE };
      this.ghost
        .ellipse(rect.x + rect.width / 2, rect.y + rect.height / 2, radius.x, radius.y)
        .stroke({ width: 2, color: GOLD_COLOR, alpha: 0.6 });
    }
  }
}

// The token's size in world px and the radii of its disc (an ellipse once it is stretched).
type TokenShape = Readonly<{ width: number; height: number; rx: number; ry: number }>;

function shapeOf(view: TokenView): TokenShape {
  const { width, height } = tokenWorldRect(view);
  return { width, height, rx: width * ROUND_RADIUS_SHARE, ry: height * ROUND_RADIUS_SHARE };
}

// With its image loaded the token is the image (square: no disc; round: cropped with the side
// ring); until then, or when it fails, the initials disc. The facing mark only when the view asks.
function drawToken(sprite: TokenSprite, texture: Texture | null): void {
  const { disc, art, shape, label, view } = sprite;
  const box = shapeOf(view);
  if (view.silhouette) return drawSilhouette(sprite, box);
  const center = { x: box.width / 2, y: box.height / 2 };
  const image = texture && view.art;
  const square = Boolean(image && view.art?.frame === 'square');
  disc.clear();
  if (!image) disc.ellipse(center.x, center.y, box.rx, box.ry).fill(DISC_COLOR);
  art.draw(view.art, texture, box, view.facing);
  shape.clear();
  if (!square)
    shape
      .ellipse(center.x, center.y, box.rx, box.ry)
      .stroke({ width: 3, color: RING_COLOR[view.ring] });
  drawOutlines(shape, view, box, square);
  drawBar(shape, view, box);
  if (view.facingMark) drawFacingMark(shape, view.facing, box);
  label.visible = !image;
  label.text = view.initials;
  label.style.fontSize = Math.round(Math.min(box.width, box.height) * 0.3);
  label.position.set(center.x, center.y);
  drawDefeated(sprite, box, square);
}

// The rings and the bar stay bright: they are about the table, not about the token's face. The
// face fades (and greys) by the defeat and the looks together, so the cross still reads first.
function drawDefeated(sprite: TokenSprite, box: TokenShape, square = false): void {
  const { disc, art, label, cross, view } = sprite;
  sprite.look.draw([disc, art.container, label], tokenLookStyle(view), { ...box, square });
  cross.clear();
  if (!view.defeated) return;
  const { strokes, width } = defeatedCross(box);
  for (const [color, stroke] of [
    [BAR_OUTLINE_COLOR, width + DEFEATED_OUTLINE],
    [DEFEATED_COLOR, width],
  ] as const) {
    for (const [from, to] of strokes) cross.moveTo(from.x, from.y).lineTo(to.x, to.y);
    cross.stroke({ width: stroke, color, cap: 'round' });
  }
}

// In the penumbra: a black shape of the footprint, nothing that tells who it is.
function drawSilhouette(sprite: TokenSprite, box: TokenShape): void {
  const { disc, art, shape, label, view } = sprite;
  disc.clear();
  if (view.silhouette === 'square') disc.rect(0, 0, box.width, box.height);
  else disc.ellipse(box.width / 2, box.height / 2, box.rx, box.ry);
  disc.fill({ color: SILHOUETTE_COLOR, alpha: SILHOUETTE_ALPHA });
  art.draw(null, null, box, 0);
  shape.clear();
  label.visible = false;
  drawDefeated(sprite, box);
}

// The turn and selection rings follow the token's outline: a square image gets square ones.
function drawOutlines(shape: Graphics, view: TokenView, box: TokenShape, square: boolean): void {
  const outline = (gap: number, width: number): void => {
    if (square) shape.rect(-gap, -gap, box.width + gap * 2, box.height + gap * 2);
    else shape.ellipse(box.width / 2, box.height / 2, box.rx + gap, box.ry + gap);
    shape.stroke({ width, color: GOLD_COLOR });
  };
  if (view.onTurn) outline(9, 4);
  if (view.selected) outline(5, 2);
}

// A small triangle on the border pointing where the token looks; it stays when nothing turns.
function drawFacingMark(shape: Graphics, facing: number, box: TokenShape): void {
  const ahead = facingVector(facing);
  const side = { x: -ahead.y, y: ahead.x };
  const base = { x: box.width / 2 + ahead.x * box.rx, y: box.height / 2 + ahead.y * box.ry };
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

function drawBar(shape: Graphics, view: TokenView, box: TokenShape): void {
  if (!view.bar) return;
  const width = box.width * 0.8;
  const left = (box.width - width) / 2;
  const top = box.height - BAR_HEIGHT - 3;
  const tones: Readonly<Record<BarTone, number>> = {
    track: BAR_TRACK_COLOR,
    fill: BAR_COLOR[view.bar.color],
    negative: BAR_NEGATIVE_COLOR,
    over: BAR_OVER_COLOR,
  };
  shape
    .roundRect(left - 1, top - 1, width + 2, BAR_HEIGHT + 2, BAR_HEIGHT / 2 + 1)
    .fill(BAR_OUTLINE_COLOR);
  for (const segment of barSegments(view.bar, width)) {
    const radius = Math.min(BAR_HEIGHT, segment.width) / 2;
    shape
      .roundRect(left + segment.left, top, segment.width, BAR_HEIGHT, radius)
      .fill(tones[segment.tone]);
  }
}

// The strip and the name live in their own layer: they go wherever the token goes (glide, drag,
// release).
function moveSprite(sprite: TokenSprite, x: number, y: number): void {
  sprite.root.position.set(x, y);
  sprite.overlay.position.set(x, y);
}

function cornerOf(view: TokenView): Point {
  const { x, y } = tokenWorldRect(view);
  return { x, y };
}
