import type { Point } from './camera';

/** The crossed eye on a token hidden from the players, in px of the token's own box: a badge on
 *  its top left corner, an almond eye with its pupil, and the slash across it (lucide `EyeOff`,
 *  drawn by the renderer because lucide is React). */
export type HiddenMark = Readonly<{
  center: Point;
  radius: number;
  eye: Readonly<{ rx: number; ry: number }>;
  pupil: number;
  slash: readonly [Point, Point];
}>;

// Shares of the badge radius, powers of two so the geometry stays whole on round sizes.
const RADIUS_SHARE = 0.1875;
const MIN_RADIUS = 7;
const EYE_RX_SHARE = 0.625;
const EYE_RY_SHARE = 0.375;
const PUPIL_SHARE = 0.1875;
const SLASH_SHARE = 0.75;

/** The badge follows the short side (a stretched token keeps a round badge) and never goes under
 *  7 px, so the eye still reads on a half-cell token.
 *
 *  Example: `hiddenMarkOf({ width: 64, height: 64 }).center // { x: 12, y: 12 }` */
export function hiddenMarkOf(box: Readonly<{ width: number; height: number }>): HiddenMark {
  const radius = Math.max(MIN_RADIUS, Math.min(box.width, box.height) * RADIUS_SHARE);
  const center = { x: radius, y: radius };
  const reach = radius * SLASH_SHARE;
  return {
    center,
    radius,
    eye: { rx: radius * EYE_RX_SHARE, ry: radius * EYE_RY_SHARE },
    pupil: radius * PUPIL_SHARE,
    slash: [
      { x: center.x - reach, y: center.y - reach },
      { x: center.x + reach, y: center.y + reach },
    ],
  };
}
