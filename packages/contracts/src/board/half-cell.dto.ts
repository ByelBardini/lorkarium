import { z } from 'zod';

/** A token side goes from half a cell to ten, in steps of half a cell (game-core `tokenSize`). */
export const TOKEN_SIZE_MIN = 0.5;
export const TOKEN_SIZE_MAX = 10;

// game-core `POSITION_STEP` written again: contracts only depends on zod.
const POSITION_STEP = 1 / 64;

type CellRange = Readonly<{ noun: string; min: number; max: number }>;

function steppedCellDto(step: number, stepText: string, { noun, min, max }: CellRange) {
  return z.number().superRefine((value, context) => {
    if (Number.isInteger(value / step) && value >= min && value <= max) return;
    context.addIssue({
      code: 'custom',
      message: `${noun} ${value} is invalid; expected a multiple of ${stepText} from ${min} to ${max}`,
    });
  });
}

/** A number in steps of half a cell from `min` to `max`, refused citing `noun` and the value.
 *
 *  Example: `halfCellDto('width', 0.5, 10).parse(2.5)` → `2.5` */
export function halfCellDto(noun: string, min: number, max: number) {
  return steppedCellDto(0.5, '0.5', { noun, min, max });
}

/** A token position on the grid, in steps of 1/64 of a cell: a free-movement token stands
 *  anywhere, and every half cell is still a multiple.
 *
 *  Example: `cellIndexDto.parse(1.015625)` → `1.015625` */
export const cellIndexDto = steppedCellDto(POSITION_STEP, '1/64', {
  noun: 'cell',
  min: 0,
  max: Number.MAX_SAFE_INTEGER,
});
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
