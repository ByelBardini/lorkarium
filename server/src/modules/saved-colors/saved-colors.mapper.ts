import type { SavedColorsResponseDto } from '@lorkarium/contracts';
import type { SavedColorPo } from './saved-colors.po';

/** The rows of an account, in the order given, as the answer of the three routes.
 *
 *  Example: `toSavedColorsResponse(rows) // { colors: ['#336699', '#aabbcc'] }` */
export function toSavedColorsResponse(rows: readonly SavedColorPo[]): SavedColorsResponseDto {
  return { colors: rows.map((row) => row.color) };
}
