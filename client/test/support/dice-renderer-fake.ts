import { act } from '@testing-library/react';
import type { DiceRenderer, DiceRendererFactory, DiceRendererRoll } from '@lorkarium/dice-renderer';

/** A dice renderer the test watches: every roll shown, the clears and whether it was destroyed. */
export class DiceRendererFake implements DiceRenderer {
  readonly shown: DiceRendererRoll[] = [];
  clears = 0;
  destroyed = false;

  show(roll: DiceRendererRoll): void {
    this.shown.push(roll);
  }

  clear(): void {
    this.clears += 1;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

/** Behind `createDiceRenderer`: counts the factory calls (the three.js load) and keeps every
 *  renderer made. `hold()` keeps the next load pending until `finishLoad()`.
 *
 *  Example: `expect(deps.diceRenderers.latest().shown[0]?.rollId).toBe(BIA_ROLL_ID)` */
export class DiceRenderersFake {
  readonly made: DiceRendererFake[] = [];
  calls = 0;
  private held: (() => void) | null = null;
  private holding = false;

  readonly create: DiceRendererFactory = () => {
    this.calls += 1;
    const renderer = new DiceRendererFake();
    this.made.push(renderer);
    if (!this.holding) return Promise.resolve(renderer);
    return new Promise((resolve) => (this.held = () => resolve(renderer)));
  };

  /** Keeps the next loads pending, as a slow `import('three')` would. */
  hold(): void {
    this.holding = true;
  }

  /** Lets a held load finish (inside `act`). */
  async finishLoad(): Promise<void> {
    this.holding = false;
    await act(async () => {
      this.held?.();
      await Promise.resolve();
    });
  }

  latest(): DiceRendererFake {
    const renderer = this.made.at(-1);
    if (renderer === undefined) throw new Error('No dice renderer was made: expected at least 1.');
    return renderer;
  }
}
