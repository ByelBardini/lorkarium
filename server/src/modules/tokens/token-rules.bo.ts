import {
  applyBarChange,
  cell,
  footprintFits,
  tokenSize,
  type BarChange,
  type SceneSize,
} from '@lorkarium/game-core';
import { StaleUndoError } from '../board/board.error';
import {
  InvalidControllerError,
  OutOfSceneError,
  type CellRef,
  type SizeRef,
} from './tokens.error';

export type TokenBoxRef = CellRef & SizeRef;

export type TokenRulesState = Readonly<{
  scene: SceneSize;
  /** Everyone at the table: only they may control a token. */
  memberIds: readonly string[];
  /** ±limit of a bar value (`BAR_VALUE_LIMIT`, passed in: the BO does not read the contract). */
  barLimit: number;
}>;

/** The rules of a token on its scene: it fits the scene, its controllers are members, and a bar
 *  moves by the shared game-core rule. No collision between tokens (spec §12).
 *
 *  Example: `new TokenRulesBo({ scene, memberIds, barLimit }).place({ col: 3, row: 4 }, { width: 1, height: 1 })` */
export class TokenRulesBo {
  constructor(private readonly state: TokenRulesState) {}

  place(at: CellRef, size: SizeRef): CellRef {
    return placeInScene(this.state.scene, at, size);
  }

  controllers(userIds: readonly string[]): string[] {
    const unique = [...new Set(userIds)];
    const strangers = unique.filter((userId) => !this.state.memberIds.includes(userId));
    if (strangers.length > 0) throw new InvalidControllerError(strangers);
    return unique;
  }

  /** The undo precondition: no `expected` (a normal move) always passes.
   *
   *  Example: `rules.requireAt(row.token.id, move.expect, row.token)` */
  requireAt(tokenId: string, expected: CellRef | undefined, actual: CellRef): void {
    if (!expected || (expected.col === actual.col && expected.row === actual.row)) return;
    const shown = (at: CellRef): string => `(${at.col}, ${at.row})`;
    throw new StaleUndoError(`token ${tokenId}`, shown(expected), shown(actual));
  }

  adjustBar(current: number, change: BarChange): number {
    return applyBarChange(current, change, this.state.barLimit);
  }
}

/** The token at `at` with `size` when it fits the scene; `OUT_OF_SCENE` otherwise.
 *
 *  Example: `placeInScene(scene, { col: 2.5, row: 3 }, { width: 1.5, height: 1 })` */
export function placeInScene(scene: SceneSize, at: CellRef, size: SizeRef): CellRef {
  const footprint = tokenSize(size.width, size.height);
  if (footprintFits(scene, cell(at.col, at.row), footprint)) return at;
  throw new OutOfSceneError(at, footprint, scene);
}

/** The undo precondition of a resize: no `expected` (a normal resize) always passes.
 *
 *  Example: `requireBox(row.token.id, resize.expect, row.token)` */
export function requireBox(
  tokenId: string,
  expected: TokenBoxRef | undefined,
  actual: TokenBoxRef,
): void {
  if (!expected || boxText(expected) === boxText(actual)) return;
  throw new StaleUndoError(`token ${tokenId}`, boxText(expected), boxText(actual));
}

function boxText(box: TokenBoxRef): string {
  return `${box.width}×${box.height} at (${box.col}, ${box.row})`;
}

/** The undo precondition of a turn: no `expected` (a normal turn) always passes.
 *
 *  Example: `requireFacing(row.token.id, face.expect?.facing, row.token.facing)` */
export function requireFacing(tokenId: string, expected: number | undefined, actual: number): void {
  if (expected === undefined || expected === actual) return;
  throw new StaleUndoError(`token ${tokenId}`, `facing ${expected}`, `facing ${actual}`);
}
