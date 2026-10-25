import type { AuraEffectDto } from '@lorkarium/contracts';
import { Container } from 'pixi.js';
import type { AuraUniforms } from '@/renderer/aura-effect-looks';
import type { AuraEffectDisplay } from '@/renderer/pixi-token-aura';

/** A ready-made effect without WebGL: keeps every update, tick and whether it was destroyed.
 *
 *  Example: `const fire = new AuraEffectFake('fire'); aura.draw(view); fire.updates[0]?.radius` */
export class AuraEffectFake implements AuraEffectDisplay {
  readonly display = new Container();
  readonly updates: AuraUniforms[] = [];
  readonly ticks: number[] = [];
  destroyed = false;

  constructor(readonly effect: AuraEffectDto) {}

  update(uniforms: AuraUniforms): void {
    this.updates.push(uniforms);
  }

  tick(seconds: number): void {
    this.ticks.push(seconds);
  }

  destroy(): void {
    this.destroyed = true;
    this.display.destroy();
  }
}

/** The factory of effects a `PixiTokenAura` receives in jsdom; `created` keeps each one, in order.
 *
 *  Example: `const effects = new AuraEffectsFake(); new PixiTokenAura('lyra', undefined, effects.create)` */
export class AuraEffectsFake {
  readonly created: AuraEffectFake[] = [];

  readonly create = (effect: AuraEffectDto): AuraEffectFake => {
    const fake = new AuraEffectFake(effect);
    this.created.push(fake);
    return fake;
  };
}
