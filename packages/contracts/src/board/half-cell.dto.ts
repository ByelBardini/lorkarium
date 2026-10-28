import { z } from 'zod';

/** A token side goes from half a cell to ten, in steps of half a cell (game-core `tokenSize`). */
export const TOKEN_SIZE_MIN = 0.5;
export const TOKEN_SIZE_MAX = 10;

/** A number in steps of half a cell from `min` to `max`, refused citing `noun` and the value.
 *
 *  Example: `halfCellDto('width', 0.5, 10).parse(2.5)` → `2.5` */
export function halfCellDto(noun: string, min: number, max: number) {
  return z.number().superRefine((value, context) => {
    if (Number.isInteger(value * 2) && value >= min && value <= max) return;
    context.addIssue({
      code: 'custom',
      message: `${noun} ${value} is invalid; expected a multiple of 0.5 from ${min} to ${max}`,
    });
  });
}

/** A token position on the grid: half cells allowed, so a 0.5 token stands at 1.5. */
export const cellIndexDto = halfCellDto('cell', 0, Number.MAX_SAFE_INTEGER);
export const tokenSideLengthDto = halfCellDto('token side', TOKEN_SIZE_MIN, TOKEN_SIZE_MAX);

/** Where a token stands and how much it covers, in cells (resize and form switch).
 *
 *  Example: `z.strictObject({ tokenId: z.uuid(), ...tokenBoxShape })` */
export const tokenBoxShape = {
  col: cellIndexDto,
  row: cellIndexDto,
  width: tokenSideLengthDto,
  height: tokenSideLengthDto,
};
