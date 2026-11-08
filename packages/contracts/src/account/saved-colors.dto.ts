import { z } from 'zod';
import { hexColorDto } from '../color/hex-color.dto';

/** How many colors one account keeps: four rows of six in the picker, no scrolling. */
export const SAVED_COLORS_MAX = 24;

/** The `code` of the refusal to save one more color when the account is at the limit. */
export const SAVED_COLORS_LIMIT_CODE = 'SAVED_COLORS_LIMIT';

/** Body of `POST /api/account/saved-colors`. The owner is the session's, never the body's.
 *
 *  Example: `saveColorRequestDto.parse({ color: '#FFAA00' }) // { color: '#ffaa00' }` */
export const saveColorRequestDto = z.strictObject({ color: hexColorDto });

export type SaveColorRequestDto = z.infer<typeof saveColorRequestDto>;

// The URL carries the hex without its #, which a URL would read as the start of a fragment.
const hexColorOfUrl = z
  .string()
  .toLowerCase()
  .regex(/^[0-9a-f]{6}$/, { error: (issue) => `${String(issue.input)}: expected rrggbb, no #` })
  .transform((digits) => `#${digits}`)
  .pipe(hexColorDto);

/** Path params of `DELETE /api/account/saved-colors/:color`.
 *
 *  Example: `savedColorParamsDto.parse({ color: 'aabbcc' }) // { color: '#aabbcc' }` */
export const savedColorParamsDto = z.strictObject({ color: hexColorOfUrl });

export type SavedColorParamsDto = z.infer<typeof savedColorParamsDto>;

/** Answer of the three saved-color routes: the whole list of the account, most recent first. */
export const savedColorsResponseDto = z.strictObject({
  colors: z.array(hexColorDto).max(SAVED_COLORS_MAX),
});

export type SavedColorsResponseDto = z.infer<typeof savedColorsResponseDto>;
