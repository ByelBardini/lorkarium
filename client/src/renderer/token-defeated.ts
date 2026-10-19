import type { Point } from './camera';

/** The two strokes of the red cross over a defeated token, in px of the token's own box. */
export type DefeatedCross = Readonly<{
  strokes: readonly (readonly [Point, Point])[];
  width: number;
}>;

// The arms reach a tenth of each side from the corners: past the round disc, inside the box.
const INSET_SHARE = 0.1;
const WIDTH_SHARE = 0.12;
const MIN_WIDTH = 3;

/** The cross of a defeated token, corner to corner of its box (a stretched token gets a stretched
 *  cross); the stroke follows the short side so a 3×3 ogre does not get a hairline.
 *
 *  Example: `defeatedCross({ width: 64, height: 64 }).strokes[0] // [{ x: 6.4, y: 6.4 }, { x: 57.6, y: 57.6 }]` */
export function defeatedCross(box: Readonly<{ width: number; height: number }>): DefeatedCross {
  const left = box.width * INSET_SHARE;
  const top = box.height * INSET_SHARE;
  const right = box.width - left;
  const bottom = box.height - top;
  return {
    strokes: [
      [
        { x: left, y: top },
        { x: right, y: bottom },
      ],
      [
        { x: right, y: top },
        { x: left, y: bottom },
      ],
    ],
    width: Math.max(MIN_WIDTH, Math.min(box.width, box.height) * WIDTH_SHARE),
  };
}
