import { effectAreaOriginFits, type EffectArea, type SceneSize } from '@lorkarium/game-core';
import { StaleUndoError } from '../board/board.error';
import { EffectAreaLimitError, EffectAreaOutOfSceneError } from './effect-areas.error';

export type EffectAreaRulesState = Readonly<{
  scene: SceneSize;
  /** `EFFECT_AREAS_PER_SCENE_MAX`, passed in: the BO does not read the contract. */
  limit: number;
}>;

const NUMERIC_FIELDS = ['x', 'y', 'width', 'height', 'reach', 'facing'] as const;
type ShapeNumbers = Partial<Record<(typeof NUMERIC_FIELDS)[number], number>>;

/** The rules of an area on its scene: its origin lies in the scene (the game-core rule the
 *  client shares; the rest is clipped), the scene keeps at most `limit` areas, and an undo finds
 *  the area with the shape it left it in.
 *
 *  Example: `new EffectAreaRulesBo({ scene, limit: 100 }).place(effectArea(circle))` */
export class EffectAreaRulesBo {
  constructor(private readonly state: EffectAreaRulesState) {}

  place(area: EffectArea): EffectArea {
    if (effectAreaOriginFits(this.state.scene, area)) return area;
    throw new EffectAreaOutOfSceneError(area, this.state.scene);
  }

  admit(stored: number, adding: number): void {
    if (stored + adding <= this.state.limit) return;
    throw new EffectAreaLimitError(stored, adding, this.state.limit);
  }

  /** No `expected` (a normal command) always passes; numbers compare to the hundredth. */
  requireShape(effectAreaId: string, expected: EffectArea | undefined, actual: EffectArea): void {
    if (!expected || sameShape(expected, actual)) return;
    throw new StaleUndoError(`effect area ${effectAreaId}`, shown(expected), shown(actual));
  }
}

function sameShape(left: EffectArea, right: EffectArea): boolean {
  if (left.kind !== right.kind || left.color !== right.color) return false;
  const one: ShapeNumbers = left;
  const other: ShapeNumbers = right;
  return NUMERIC_FIELDS.every((field) => hundredths(one[field]) === hundredths(other[field]));
}

function hundredths(value: number | undefined): number {
  return Math.round((value ?? 0) * 100);
}

function shown(shape: EffectArea): string {
  const numbers: ShapeNumbers = shape;
  const sizes = NUMERIC_FIELDS.slice(2)
    .filter((field) => numbers[field] !== undefined)
    .map((field) => `${field} ${String(numbers[field])}`);
  return `${shape.kind} (${shape.x}, ${shape.y}) ${sizes.join(' ')} ${shape.color}`;
}
