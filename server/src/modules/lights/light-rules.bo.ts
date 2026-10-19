import { lightFits, type LightRange, type SceneLight, type SceneSize } from '@lorkarium/game-core';
import { StaleUndoError } from '../board/board.error';
import { LightLimitError, LightOutOfSceneError } from './lights.error';

export type LightRulesState = Readonly<{
  scene: SceneSize;
  /** `LIGHTS_PER_SCENE_MAX`, passed in: the BO does not read the contract. */
  limit: number;
}>;

export type LightPosition = Readonly<{ x: number; y: number }>;

/** The rules of a map light on its scene: its point lies inside the scene, the scene keeps at most
 *  so many lights, and an undo finds the light as it left it.
 *
 *  Example: `new LightRulesBo({ scene, limit: 100 }).place(sceneLightOf(row))` */
export class LightRulesBo {
  constructor(private readonly state: LightRulesState) {}

  place(light: SceneLight): SceneLight {
    if (lightFits(this.state.scene, light)) return light;
    throw new LightOutOfSceneError(light, this.state.scene);
  }

  admit(stored: number, adding: number): void {
    const total = stored + adding;
    if (total > this.state.limit) throw new LightLimitError(total, this.state.limit);
  }

  /** No `expected` (a normal command) always passes; points compare to the hundredth. */
  requireAt(lightId: string, expected: LightPosition | undefined, actual: LightPosition): void {
    if (!expected || (same(expected.x, actual.x) && same(expected.y, actual.y))) return;
    throw new StaleUndoError(`light ${lightId}`, pointShown(expected), pointShown(actual));
  }

  requireRange(lightId: string, expected: LightRange | undefined, actual: LightRange): void {
    if (!expected) return;
    if (same(expected.bright, actual.bright) && same(expected.dim, actual.dim)) return;
    throw new StaleUndoError(`light ${lightId}`, rangeShown(expected), rangeShown(actual));
  }
}

function same(left: number, right: number): boolean {
  return Math.round(left * 100) === Math.round(right * 100);
}

function pointShown({ x, y }: LightPosition): string {
  return `(${x}, ${y})`;
}

function rangeShown({ bright, dim }: LightRange): string {
  return `bright ${bright}, dim ${dim}`;
}
