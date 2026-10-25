import type { TokenLayerDto } from '@lorkarium/contracts';
import { Container } from 'pixi.js';
import type { Point } from './camera';
import { PixiTokenAura, type AuraEffectFactory, type AuraImages } from './pixi-token-aura';
import type { TokenView } from './token-view';

/** The auras of the tokens, one floor per layer: the token layer puts each floor right under the
 *  tokens of its layer (and over the layer below), so an aura never covers a token. Kept by token
 *  id, created when a token gets an aura and destroyed when it loses it.
 *
 *  Example: `const floors = new PixiAuraFloors(); layerOfTokens.addChild(floors.floors.tokens)` */
export class PixiAuraFloors {
  readonly floors: Readonly<Record<TokenLayerDto, Container>> = {
    background: new Container(),
    objects: new Container(),
    tokens: new Container(),
  };
  private readonly auras = new Map<string, PixiTokenAura>();
  private readonly moving = new Set<PixiTokenAura>();

  /** `images`: where the image auras come from; `effects`: the shader of an effect (a fake in
   *  jsdom, which has no WebGL; the real `PixiAuraEffect` by default). */
  constructor(
    private readonly images?: AuraImages,
    private readonly effects?: AuraEffectFactory,
  ) {}

  /** The image of `url` arrived: only the auras that show it are drawn again. */
  refresh(url: string): void {
    for (const aura of this.auras.values()) {
      if (!aura.shows(url)) continue;
      aura.redraw();
      this.track(aura);
    }
  }

  /** The auras whose drawing moves with time (what the animator ticks): kept as they change, so
   *  the animator never walks every token. */
  animated(): ReadonlySet<PixiTokenAura> {
    return this.moving;
  }

  /** Draws the aura of `view` (or takes it away), on the floor of its layer, at `at` (the
   *  token's top-left corner, where its sprite is now). */
  draw(view: TokenView, at: Point): void {
    if (!view.aura) return this.remove(view.id);
    const aura = this.auras.get(view.id) ?? this.add(view, at);
    aura.draw(view.aura);
    this.track(aura);
  }

  /** The token went to another layer: its aura goes to that floor, without drawing again. */
  changeLayer(tokenId: string, layer: TokenLayerDto): void {
    const aura = this.auras.get(tokenId);
    if (aura) this.floors[layer].addChild(aura.container);
  }

  /** Follows the token (glide, drag, release). */
  move(tokenId: string, x: number, y: number): void {
    this.auras.get(tokenId)?.container.position.set(x, y);
  }

  remove(tokenId: string): void {
    const aura = this.auras.get(tokenId);
    if (!aura) return;
    this.moving.delete(aura);
    aura.destroy();
    this.auras.delete(tokenId);
  }

  private track(aura: PixiTokenAura): void {
    if (aura.animated()) this.moving.add(aura);
    else this.moving.delete(aura);
  }

  private add(view: TokenView, at: Point): PixiTokenAura {
    const aura = new PixiTokenAura(view.id, this.images, this.effects);
    aura.container.position.set(at.x, at.y);
    this.floors[view.layer].addChild(aura.container);
    this.auras.set(view.id, aura);
    return aura;
  }
}
