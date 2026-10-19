import { z } from 'zod';

/** The longest bright or dim reach of sight or light, in cells (game-core `REACH_MAX`). */
export const REACH_MAX = 100;

/** One side of a sight or light range: a finite number from 0 to 100 cells, refused citing what
 *  reaches, the side and the value (NaN goes through to the refine so the refusal cites it too).
 *
 *  Example: `reachSideDto('light', 'bright').parse(4)` → `4` */
export function reachSideDto(subject: 'sight' | 'light', side: 'bright' | 'dim') {
  return z.union([z.number(), z.nan()]).superRefine((value, context) => {
    if (Number.isFinite(value) && value >= 0 && value <= REACH_MAX) return;
    context.addIssue({
      code: 'custom',
      message: `${subject} ${side} ${value} is invalid; expected 0 to ${REACH_MAX} cells`,
    });
  });
}
