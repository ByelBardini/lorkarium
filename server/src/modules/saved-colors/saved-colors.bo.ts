import { SavedColorsLimitError } from './saved-colors.error';

/** Whether a color goes into an account's list: repeating one changes nothing, even at the limit,
 *  and a new one needs room below `maxSaved`.
 *
 *  Example: `new SavedColorAdmissionBo(SAVED_COLORS_MAX).mustInsert(['#aabbcc'], '#336699') // true` */
export class SavedColorAdmissionBo {
  constructor(private readonly maxSaved: number) {}

  /** `false` when the color is already kept; throws `SAVED_COLORS_LIMIT` when a new one has no room.
   *
   *  Example: `rules.mustInsert(['#aabbcc'], '#aabbcc') // false` */
  mustInsert(saved: readonly string[], color: string): boolean {
    if (saved.includes(color)) return false;
    if (saved.length >= this.maxSaved) throw new SavedColorsLimitError(saved.length, this.maxSaved);
    return true;
  }
}
