import { auraFrameDue, auraOnScreen } from './aura-motion';
import type { WorldRect } from './token-box';

/** An aura whose drawing moves with time: where it is in the world, and its step. */
export interface AnimatedAura {
  worldBox(): WorldRect;
  tick(seconds: number): void;
}

/** What one frame of the board tells the animator: the view (world px) and whether the auras
 *  play ("Animar auras" and the system's reduced motion). */
export type AuraMotionFrame = Readonly<{ visible: WorldRect; playing: boolean }>;

/** Steps the animated auras from the ticker, at most 30 times per second and only those on
 *  screen. It walks only the set of animated auras (like the gliding tokens), never every token,
 *  and asks for nothing while there is none. Its clock is the time played: stilled and played
 *  again, the auras go on from the frame where they stopped.
 *
 *  Example: `if (animator.animate(performance.now(), () => frame) || renderDue) app.render()` */
export class PixiAuraAnimator {
  private lastMs: number | null = null;
  private playedMs = 0;

  constructor(private readonly auras: () => ReadonlySet<AnimatedAura>) {}

  /** Whether any aura stepped: the frame must render it. `frameOf` is asked only when some aura
   *  animates and a step is due (at most 30 media queries per second). */
  animate(nowMs: number, frameOf: () => AuraMotionFrame): boolean {
    const auras = this.auras();
    if (auras.size === 0) return this.pause();
    if (this.lastMs !== null && !auraFrameDue(this.lastMs, nowMs)) return false;
    const frame = frameOf();
    if (!frame.playing) return this.pause();
    this.playedMs += this.lastMs === null ? 0 : nowMs - this.lastMs;
    this.lastMs = nowMs;
    return this.step(auras, frame.visible);
  }

  private step(auras: ReadonlySet<AnimatedAura>, visible: WorldRect): boolean {
    let stepped = false;
    for (const aura of auras) {
      if (!auraOnScreen(aura.worldBox(), visible)) continue;
      aura.tick(this.playedMs / 1000);
      stepped = true;
    }
    return stepped;
  }

  // The time stilled (or with no animated aura) is not played.
  private pause(): false {
    this.lastMs = null;
    return false;
  }
}
