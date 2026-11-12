import type { PlanLimits } from '@lorkarium/contracts';
import { lightFits, type LightRange, type SceneLight, type SceneSize } from '@lorkarium/game-core';
import { StaleUndoError } from '../board/board.error';
import { PlanLimitsBo } from '../plans/plan-limits.bo';
import { LightLimitError, LightOutOfSceneError } from './lights.error';

export type LightRulesState = Readonly<{
  scene: SceneSize;
  /** `LIGHTS_PER_SCENE_MAX`, passed in: the BO does not read the contract. */
  limit: number;
  /** The table's effective limits (its owner's plan): `maxLights` per scene, and the other checks
   *  a light command runs. */
  plan: PlanLimits;
}>;

export type LightPosition = Readonly<{ x: number; y: number }>;
/** A palette name, or `null` for neutral: the game-core does not know the palette. */
export type LightColor = string | null;
/** Where a light points and how wide it opens, in degrees (360 = every side). */
export type LightCone = Readonly<{ facing: number; angle: number }>;

/** The rules of a map light on its scene: its point lies inside the scene, the scene keeps at most
 *  so many lights (the table's plan, then the technical ceiling), and an undo finds the light as
 *  it left it.
 *
 *  Example: `new LightRulesBo({ scene, limit: 100, plan }).place(sceneLightOf(row))` */
export class LightRulesBo {
  constructor(private readonly state: LightRulesState) {}

  /** The table's effective limits the rule was built with. */
  get plan(): PlanLimits {
    return this.state.plan;
  }

  place(light: SceneLight): SceneLight {
    if (lightFits(this.state.scene, light)) return light;
    throw new LightOutOfSceneError(light, this.state.scene);
  }

  /** Past the plan is PLAN_LIMIT `lights`; past the technical ceiling, LIGHT_LIMIT. Adding nothing
   *  always passes (a scene of a lower plan keeps its lights). */
  admit(stored: number, adding: number): void {
    PlanLimitsBo.requireRoom('lights', stored, adding, this.state.plan);
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

  requireColor(
    lightId: string,
    expected: Readonly<{ color: LightColor }> | undefined,
    actual: LightColor,
  ): void {
    if (!expected || expected.color === actual) return;
    throw new StaleUndoError(`light ${lightId}`, colorShown(expected.color), colorShown(actual));
  }

  requireCone(lightId: string, expected: LightCone | undefined, actual: LightCone): void {
    if (!expected || (expected.facing === actual.facing && expected.angle === actual.angle)) return;
    throw new StaleUndoError(`light ${lightId}`, coneShown(expected), coneShown(actual));
  }
}

function same(left: number, right: number): boolean {
  return Math.round(left * 100) === Math.round(right * 100);
}

function pointShown({ x, y }: LightPosition): string {
  return `(${x}, ${y})`;
}

function colorShown(color: LightColor): string {
  return color ?? 'neutral';
}

function coneShown({ facing, angle }: LightCone): string {
  return `facing ${facing}, angle ${angle}`;
}

function rangeShown({ bright, dim }: LightRange): string {
  return `bright ${bright}, dim ${dim}`;
}
