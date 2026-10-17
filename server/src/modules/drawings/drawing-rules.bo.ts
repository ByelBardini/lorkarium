import { boxFits, type DrawingBox, type SceneSize } from '@lorkarium/game-core';
import { StaleUndoError } from '../board/board.error';
import { DrawingLimitError, DrawingOutOfSceneError } from './drawings.error';

export type DrawingRulesState = Readonly<{
  scene: SceneSize;
  /** `DRAWINGS_PER_SCENE_MAX`, passed in: the BO does not read the contract. */
  limit: number;
}>;

export type DrawingPosition = Readonly<{ x: number; y: number }>;

/** The rules of a drawing on its scene: its box fits the scene (the game-core rule the client
 *  shares), the scene keeps at most `limit` drawings, and an undo finds the drawing where it left it.
 *
 *  Example: `new DrawingRulesBo({ scene, limit: 500 }).place(drawingBox(2, 3, 2, 2))` */
export class DrawingRulesBo {
  constructor(private readonly state: DrawingRulesState) {}

  place(box: DrawingBox): DrawingBox {
    if (boxFits(this.state.scene, box)) return box;
    throw new DrawingOutOfSceneError(box, this.state.scene);
  }

  admit(stored: number, adding: number): void {
    if (stored + adding <= this.state.limit) return;
    throw new DrawingLimitError(stored, adding, this.state.limit);
  }

  /** No `expected` (a normal command) always passes; positions compare to the hundredth. */
  requireAt(
    drawingId: string,
    expected: DrawingPosition | undefined,
    actual: DrawingPosition,
  ): void {
    if (!expected || samePosition(expected, actual)) return;
    throw new StaleUndoError(`drawing ${drawingId}`, shown(expected), shown(actual));
  }
}

function samePosition(left: DrawingPosition, right: DrawingPosition): boolean {
  return hundredths(left.x) === hundredths(right.x) && hundredths(left.y) === hundredths(right.y);
}

function hundredths(value: number): number {
  return Math.round(value * 100);
}

function shown({ x, y }: DrawingPosition): string {
  return `(${x}, ${y})`;
}
