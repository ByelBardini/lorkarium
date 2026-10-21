import { z } from 'zod';

export const FACING_MAX = 359;

/** Where a token looks, in whole degrees: 0 = right, clockwise on screen (game-core `Facing`). */
export const facingDto = z.number().superRefine((value, context) => {
  if (Number.isInteger(value) && value >= 0 && value <= FACING_MAX) return;
  context.addIssue({
    code: 'custom',
    message: `facing ${value} is invalid; expected a whole number from 0 to ${FACING_MAX}`,
  });
});

/** The widest cone, in degrees: 360 sees or shines every side (game-core `CONE_ANGLE_MAX`). */
export const CONE_ANGLE_MAX = 360;

/** How wide a cone of sight or light opens: a whole number of degrees from 1 to 360, refused
 *  citing what opens and the value (NaN goes through to the refine so the refusal cites it too).
 *
 *  Example: `coneAngleDto('sight').parse(90)` → `90` */
export function coneAngleDto(subject: 'sight' | 'light') {
  return z.union([z.number(), z.nan()]).superRefine((value, context) => {
    if (Number.isInteger(value) && value >= 1 && value <= CONE_ANGLE_MAX) return;
    context.addIssue({
      code: 'custom',
      message: `${subject} angle ${value} is invalid; expected a whole number from 1 to ${CONE_ANGLE_MAX}`,
    });
  });
}
