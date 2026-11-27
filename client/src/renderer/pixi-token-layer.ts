import { Container, Graphics } from 'pixi.js';
import { conditionIconUrlOf } from '@/lib/condition-icons';
import { NO_PERF_PROBE, type PerfProbe } from '@/lib/perf-probe';
import type { TokenLayerDto } from '@lorkarium/contracts';
import type { GhostView, TokenView } from './board-view';
import type { Point } from './camera';
import { PixiAuraFloors } from './pixi-aura-floors';
import type { AuraImages, PixiTokenAura } from './pixi-token-aura';
import { ROUND_RADIUS_SHARE } from './pixi-token-art';
import type { PixiTextureCache } from './pixi-texture-cache';
import { showsNameTag } from './name-tag';
import { drawTokenBody, newTokenSprite, type TokenSprite } from './pixi-token-sprite';
import { tokenWorldRect } from './token-box';
import { tokenRedrawOf, type TokenRedraw } from './token-redraw';

// Design system token (client/src/index.css): the canvas cannot read CSS variables.
const GOLD_COLOR = 0xc5a46d;
const MOVE_ANIMATION_MS = 150;

/** Where the token images come from: a texture, or `null` while it loads (or failed). */
export type TokenTextures = Pick<PixiTextureCache, 'textureOf'>;

const WHOLE: TokenRedraw = { body: true, nameTag: true, aura: true };
const STRIP_ONLY: TokenRedraw = { body: false, nameTag: false, aura: false };

/** The tokens on the canvas: one `Container` per token, kept by id so a change redraws only that
 *  token, and of it only the part that changed (`tokenRedrawOf`; spec §14, rendering risk), inside
 *  one `Container` per layer (Fundo under Objetos under Tokens), each with the floor of its auras
 *  right under it (`PixiAuraFloors`). Only the tokens gliding to a new
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
  private readonly auras: PixiAuraFloors;
  private zoom = 1;
  private readonly sprites = new Map<string, TokenSprite>();
  private readonly ghost = new Graphics();
  private readonly gliding = new Set<string>();
  private dragging: string | null = null;
  private hovered: string | null = null;

  /** `beneath`: what goes over Fundo and Objetos and under the tokens of Tokens (the areas of
   *  effect and the drawings); `textures`: where the token images come from (without it, every
   *  token is the initials disc); `probe` counts each body redrawn (`token.redraw`); `auraImages`:
   *  where the image auras come from (without it, an image aura draws nothing). */
  constructor(
    private readonly reducedMotion: () => boolean,
    beneath?: Container,
    private readonly textures?: TokenTextures,
    private readonly probe: PerfProbe = NO_PERF_PROBE,
    auraImages?: AuraImages,
  ) {
    this.auras = new PixiAuraFloors(auraImages);
    const { background, objects, tokens } = this.layers;
    if (beneath) tokens.addChild(beneath);
    const { strips } = this;
    const { floors } = this.auras;
    this.container.addChild(floors.background, background, strips.background);
    this.container.addChild(floors.objects, objects, strips.objects);
    this.container.addChild(floors.tokens, tokens, strips.tokens, this.ghost);
  }

  sync(tokens: readonly TokenView[], ghosts: readonly GhostView[], nowMs: number): void {
    const alive = new Set(tokens.map(({ id }) => id));
    for (const [id, sprite] of this.sprites) {
      if (alive.has(id)) continue;
      sprite.root.destroy({ children: true });
      sprite.overlay.destroy({ children: true });
      this.auras.remove(id);
      this.sprites.delete(id);
      this.gliding.delete(id);
    }
    for (const view of tokens) this.place(view, nowMs);
    this.drawGhosts(ghosts);
  }

  /** The strips follow the zoom (dots from afar, rounds up close); only a strip that changes
   *  is drawn again. Call once the zoom settles (`FrameJob.zoom`), never per wheel tick. */
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

  /** The texture of `url` arrived: only the tokens that show that image are drawn again — the
   *  body of those with it as art, the strip of those with a condition that has it. */
  refreshArt(url: string): void {
    for (const sprite of this.sprites.values()) {
      const art = sprite.view.art?.url === url;
      if (!art && !showsConditionImage(sprite.view, url)) continue;
      const artArrived = { artArrived: true };
      this.draw(sprite, art ? tokenRedrawOf(sprite.view, sprite.view, artArrived) : STRIP_ONLY);
    }
  }

  /** The image of an aura arrived: only the auras that show it are drawn, never a body. */
  refreshAura(url: string): void {
    this.auras.refresh(url);
  }

  /** The auras that move with time, for the animator. */
  animatedAuras(): ReadonlySet<PixiTokenAura> {
    return this.auras.animated();
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
    this.moveSprite(sprite, world.x - rect.width / 2, world.y - rect.height / 2);
  }

  /** Back to the confirmed cell: the ghost or the confirmed event shows where it goes. */
  release(): void {
    const sprite = this.dragging ? this.sprites.get(this.dragging) : undefined;
    this.dragging = null;
    if (sprite) this.moveSprite(sprite, sprite.to.x, sprite.to.y);
  }

  /** Moves each gliding token a step along its glide (150 ms, or a patrol's whole step, linear);
   *  call from the ticker. A token that
   *  arrived leaves the set, so a still board costs nothing. Whether any token stepped: the frame
   *  must render it (its last step included, so the caller asks before anything else). */
  animate(nowMs: number): boolean {
    const stepped = this.gliding.size > 0;
    for (const id of this.gliding) {
      const sprite = this.sprites.get(id);
      if (!sprite || id === this.dragging) continue;
      const progress = Math.min(1, (nowMs - sprite.startedMs) / sprite.glideMs);
      const x = sprite.from.x + (sprite.to.x - sprite.from.x) * progress;
      const y = sprite.from.y + (sprite.to.y - sprite.from.y) * progress;
      this.moveSprite(sprite, x, y);
      if (progress === 1) this.gliding.delete(id);
    }
    return stepped;
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
    if (moved) this.glide(known, target, nowMs, this.reducedMotion() || resized, view.glideMs);
    if (known.view.layer !== view.layer) {
      this.layers[view.layer].addChild(known.root);
      this.strips[view.layer].addChild(known.overlay);
      this.auras.changeLayer(view.id, view.layer);
    }
    const redraw = tokenRedrawOf(known.view, view);
    known.view = view;
    this.draw(known, redraw);
  }

  private glide(
    sprite: TokenSprite,
    target: Point,
    nowMs: number,
    instant: boolean,
    glideMs: number | null,
  ): void {
    sprite.from = instant ? target : { x: sprite.root.x, y: sprite.root.y };
    sprite.to = target;
    sprite.startedMs = nowMs;
    sprite.glideMs = glideMs ?? MOVE_ANIMATION_MS;
    if (instant && sprite.view.id !== this.dragging) this.moveSprite(sprite, target.x, target.y);
    if (!instant) this.gliding.add(sprite.view.id);
  }

  // The strip keeps its own key; the plate moves when the strip under the token changes height.
  private draw(sprite: TokenSprite, redraw: TokenRedraw): void {
    if (redraw.aura) this.auras.draw(sprite.view, sprite.root.position);
    if (redraw.body) {
      this.probe.count('token.redraw');
      const art = sprite.view.art;
      drawTokenBody(sprite, art ? (this.textures?.textureOf(art.url) ?? null) : null);
    }
    const { band, height } = sprite.marks.draw(sprite.view, this.zoom);
    if (band !== 'none') this.probe.count('strip.redraw');
    if (!redraw.nameTag && height === sprite.stripHeight) return;
    sprite.stripHeight = height;
    sprite.nameTag.draw(sprite.view, showsNameTag(sprite.view, this.hovered), height);
  }

  // The strip, the name and the aura live in their own layers: they go wherever the token goes
  // (glide, drag, release).
  private moveSprite(sprite: TokenSprite, x: number, y: number): void {
    sprite.root.position.set(x, y);
    sprite.overlay.position.set(x, y);
    this.auras.move(sprite.view.id, x, y);
  }

  private add(view: TokenView, at: Point, nowMs: number): void {
    const sprite = newTokenSprite(view, at, nowMs, this.textures);
    this.layers[view.layer].addChild(sprite.root);
    this.strips[view.layer].addChild(sprite.overlay);
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

function showsConditionImage(view: TokenView, url: string): boolean {
  return view.conditions.some(
    ({ icon, imageUrl }) => imageUrl === url || conditionIconUrlOf(icon) === url,
  );
}

function cornerOf(view: TokenView): Point {
  const { x, y } = tokenWorldRect(view);
  return { x, y };
}
