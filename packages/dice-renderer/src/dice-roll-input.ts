import type { DieKind, MemberColor } from '@lorkarium/game-core';

/** The renderer's own shape of a roll, so the package stands alone (no contracts): the app's
 *  validated DTOs fit it structurally and pass straight through. */

/** A palette name or a normalized custom `#rrggbb`.
 *
 *  Example: `const color: DiceColor = 'rose'` */
export type DiceColor = MemberColor | `#${string}`;

/** One recorded die: its shape, when its wave is thrown and settles (ms on the throw's clock)
 *  and the quantized poses, 7 integers per frame.
 *
 *  Example: `{ kind: 'd20', startMs: 0, settleMs: 2400, frames }` */
export interface DiceThrowModel {
  readonly kind: DieKind;
  readonly startMs: number;
  readonly settleMs: number;
  readonly frames: readonly number[];
}

/** The recorded throw to replay: the roller's box aspect, the frame step and one model per die.
 *
 *  Example: `{ aspect: 1.78, frameMs: 1000 / 30, models: [d20Model] }` */
export interface DiceThrow {
  readonly aspect: number;
  readonly frameMs: number;
  readonly models: readonly DiceThrowModel[];
}

/** How the roller's dice look: the color, the texture (`null` = the color) and the number color
 *  (`null` = the look decides).
 *
 *  Example: `{ color: 'rose', textureId: null, numberColor: null }` */
export interface DiceAppearance {
  readonly color: DiceColor;
  readonly textureId: string | null;
  readonly numberColor: `#${string}` | null;
}
