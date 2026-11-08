import { z } from 'zod';

// This pattern is what keeps a color from injecting into inline styles and generated SVG.
const NORMALIZED_HEX_COLOR = /^#[0-9a-f]{6}$/;

/** A custom color: opaque `#rrggbb`, kept in lowercase. The only door for one into the system.
 *
 *  Example: `hexColorDto.parse('#FFAA00') // '#ffaa00'` */
export const hexColorDto = z
  .string()
  .trim()
  .toLowerCase()
  .regex(NORMALIZED_HEX_COLOR, { error: (issue) => `${String(issue.input)}: expected #rrggbb` })
  .pipe(z.templateLiteral(['#', z.string()]));

export type HexColorDto = z.infer<typeof hexColorDto>;

/** Whether a text is already a normalized custom color, as opposed to a palette name.
 *
 *  Example: `isHexColor('gold') // false` */
export function isHexColor(text: string): text is HexColorDto {
  return NORMALIZED_HEX_COLOR.test(text);
}

/** A color that is either a name of the given palette or a custom color.
 *
 *  Example: `paletteOrHexDto(['gold', 'steel']).parse('#123456') // '#123456'` */
export function paletteOrHexDto<const Palette extends readonly [string, ...string[]]>(
  palette: Palette,
) {
  return z.union([z.enum(palette), hexColorDto]);
}
