import type { DiceRenderer, DiceRendererRoll } from '@lorkarium/dice-renderer';
import type { RecordedThrow } from '@/lib/recorded-throws';
import type { LoadedDice } from '@/scripts/dice-act';

/** The 3D dice without WebGL: keeps every roll shown and counts the clears. */
export class DiceRendererFake implements DiceRenderer {
  readonly played: DiceRendererRoll[] = [];
  clears = 0;
  destroyed = false;

  show(roll: DiceRendererRoll): void {
    this.played.push(roll);
  }

  clear(): void {
    this.clears += 1;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

/**
 * The lazy `import()` of the renderer and the recording: counts the loads and answers with the
 * fake renderer and the given throws, or refuses like a browser without WebGL after `refuse()`.
 * Example: `const loader = new DiceRendererLoaderFake(throws); loader.load(stage)`
 */
export class DiceRendererLoaderFake {
  readonly renderer = new DiceRendererFake();

  constructor(private readonly throws: readonly RecordedThrow[]) {}

  readonly stages: HTMLElement[] = [];
  private refused = false;

  get loads(): number {
    return this.stages.length;
  }

  refuse(): this {
    this.refused = true;
    return this;
  }

  readonly load = (stage: HTMLElement): Promise<LoadedDice> => {
    this.stages.push(stage);
    if (this.refused) return Promise.reject(new Error('WebGL is not available'));
    return Promise.resolve({ renderer: this.renderer, throws: this.throws });
  };
}
