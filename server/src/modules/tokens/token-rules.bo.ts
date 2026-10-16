import {
  applyBarChange,
  cell,
  footprintFits,
  type BarChange,
  type SceneSize,
} from '@lorkarium/game-core';
import { InvalidControllerError, OutOfSceneError, type CellRef } from './tokens.error';

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
 *  Example: `new TokenRulesBo({ scene, memberIds, barLimit }).place({ col: 3, row: 4 }, 1)` */
export class TokenRulesBo {
  constructor(private readonly state: TokenRulesState) {}

  place(at: CellRef, size: number): CellRef {
    if (footprintFits(this.state.scene, cell(at.col, at.row), size)) return at;
    throw new OutOfSceneError(at, size, this.state.scene);
  }

  controllers(userIds: readonly string[]): string[] {
    const unique = [...new Set(userIds)];
    const strangers = unique.filter((userId) => !this.state.memberIds.includes(userId));
    if (strangers.length > 0) throw new InvalidControllerError(strangers);
    return unique;
  }

  adjustBar(current: number, change: BarChange): number {
    return applyBarChange(current, change, this.state.barLimit);
  }
}
