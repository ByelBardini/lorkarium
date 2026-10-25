import type { AuraEffectDto } from '@lorkarium/contracts';
import { Container, Graphics, Sprite } from 'pixi.js';
import { AURA_EFFECT_LOOKS, auraUniformsOf } from './aura-effect-looks';
import { auraHaloOf, auraImageBox, type AuraLook, type AuraView } from './aura-view';
import { gifFrameAt } from './gif-frame';
import { CELL_WORLD_SIZE } from './camera';
import type { AnimatedAura } from './pixi-aura-animator';
import { PixiAuraEffect } from './pixi-aura-effect';
import type { AuraImageSource, PixiAuraSources } from './pixi-aura-sources';
import type { WorldRect } from './token-box';

/** Where the aura images come from: a source, or `null` while it loads (or failed). */
export type AuraImages = Pick<PixiAuraSources, 'sourceOf'>;

/** What an aura needs of a ready-made effect (`PixiAuraEffect`; a fake where there is no WebGL). */
export type AuraEffectDisplay = Pick<
  PixiAuraEffect,
  'effect' | 'display' | 'update' | 'tick' | 'destroy'
>;

/** Makes the shader quad of one effect. */
export type AuraEffectFactory = (effect: AuraEffectDto) => AuraEffectDisplay;

const pixiAuraEffect: AuraEffectFactory = (effect) => new PixiAuraEffect(effect);

/** The aura of one token on the floor of its layer: `container` sits at the token's top-left
 *  corner (moved with it) and draws the aura around it, by kind: the soft halo of a color, an
 *  effect (its shader quad, `PixiAuraEffect`), or an image (whole inside the aura; a GIF by the
 *  frame of its time). `tick(seconds)` moves what animates (the effect's shader clock, the frame of
 *  a GIF): the animator calls it, never `draw`.
 *
 *  Example: `const aura = new PixiTokenAura('lyra'); aura.draw(view.aura); floor.addChild(aura.container)` */
export class PixiTokenAura implements AnimatedAura {
  readonly container = new Container();
  private readonly halo = new Graphics();
  private readonly image = new Sprite();
  private view: AuraView | null = null;
  private source: AuraImageSource | null = null;
  private effect: AuraEffectDisplay | null = null;

  /** `images`: where the image auras come from (without it, an image aura draws nothing);
   *  `effects`: makes the shader of an effect (a fake in jsdom, which has no WebGL). */
  constructor(
    private readonly tokenId: string,
    private readonly images?: AuraImages,
    private readonly effects: AuraEffectFactory = pixiAuraEffect,
  ) {
    this.container.label = `aura:${tokenId}`;
    this.image.visible = false;
    this.container.addChild(this.halo, this.image);
  }

  /** Draws the aura again: call only when its key changed (`auraKeyOf`) or its image arrived. */
  draw(view: AuraView): void {
    this.view = view;
    this.halo.clear();
    this.image.visible = false;
    this.source = null;
    const { look } = view;
    if (look.kind !== 'effect') this.dropEffect();
    if (look.kind === 'color') return this.drawHalo(view, look.color);
    if (look.kind === 'effect') return this.drawEffect(view, look);
    this.drawImage(view, look.url);
  }

  /** Draws the last view again (its image arrived). */
  redraw(): void {
    if (this.view) this.draw(this.view);
  }

  /** Whether the aura shows the image of `url` (to draw it again when it arrives). */
  shows(url: string): boolean {
    const look = this.view?.look;
    return look?.kind === 'image' && look.url === url;
  }

  /** Whether `tick` changes what is drawn (an effect shader, a GIF with more than one frame). */
  animated(): boolean {
    return this.effect !== null || this.source?.kind === 'animated';
  }

  /** Where the aura is now in the world (it follows the glide and the drag): what the animator
   *  checks against the view. */
  worldBox(): WorldRect {
    const { x, y } = this.container.position;
    const view = this.view;
    if (!view) return { x, y, width: 0, height: 0 };
    const { width, height } = view.box;
    return { x: x - view.corner, y: y - view.corner, width, height };
  }

  /** Moves what animates to `seconds` of the animator's clock: the frame of a GIF. */
  tick(seconds: number): void {
    this.effect?.tick(seconds);
    const frames = this.source?.frames;
    if (!frames || frames.length < 2) return;
    const frame = frames[gifFrameAt(frames, seconds * 1000)];
    if (frame) this.image.texture = frame.texture;
  }

  destroy(): void {
    this.dropEffect();
    this.container.destroy({ children: true });
  }

  // One quad per aura, made again only for another effect. The container sits at the token's
  // corner, so the token box is local from 0; the hidden fade is folded into the opacity.
  private drawEffect(view: AuraView, look: Extract<AuraLook, { kind: 'effect' }>): void {
    if (this.effect?.effect !== look.effect) this.dropEffect();
    const effect = this.effect ?? this.addEffect(look.effect);
    const { box, corner } = view;
    const token = { x: 0, y: 0, width: box.width - corner * 2, height: box.height - corner * 2 };
    effect.update(
      auraUniformsOf({
        box: token,
        radiusCells: corner / CELL_WORLD_SIZE,
        cellSize: CELL_WORLD_SIZE,
        opacity: view.alpha * 100,
        color: look.tint ?? AURA_EFFECT_LOOKS[look.effect].naturalColor,
        tokenId: this.tokenId,
      }),
    );
  }

  private addEffect(name: AuraEffectDto): AuraEffectDisplay {
    const effect = this.effects(name);
    this.container.addChild(effect.display);
    this.effect = effect;
    return effect;
  }

  private dropEffect(): void {
    this.effect?.destroy();
    this.effect = null;
  }

  private drawImage(view: AuraView, url: string): void {
    const source = this.images?.sourceOf(url) ?? null;
    const first = source?.frames[0];
    if (!source || !first) return;
    this.source = source;
    const box = auraImageBox(view, source);
    this.image.texture = first.texture;
    this.image.position.set(box.x, box.y);
    this.image.setSize(box.width, box.height);
    this.image.alpha = view.alpha;
    this.image.visible = true;
  }

  private drawHalo(view: AuraView, color: number): void {
    for (const { x, y, width, height, radius, alpha } of auraHaloOf(view)) {
      if (width <= 0 || height <= 0) continue;
      this.halo.roundRect(x, y, width, height, radius).fill({ color, alpha });
    }
  }
}
