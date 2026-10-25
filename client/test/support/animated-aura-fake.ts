import type { AnimatedAura } from '@/renderer/pixi-aura-animator';
import type { WorldRect } from '@/renderer/token-box';

/** An animated aura at `box` that keeps the time of every tick it got.
 *
 *  Example: `const torch = new AnimatedAuraFake({ x: 0, y: 0, width: 64, height: 64 })` */
export class AnimatedAuraFake implements AnimatedAura {
  readonly ticks: number[] = [];

  constructor(private readonly box: WorldRect) {}

  worldBox(): WorldRect {
    return this.box;
  }

  tick(seconds: number): void {
    this.ticks.push(seconds);
  }
}
