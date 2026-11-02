import { requireReadableDice } from '../dice/dice-roll.bo';
import { SavedRollFoldersLimitError, SavedRollsLimitError } from './saved-rolls.error';

/** The rules of one member's saved rolls: every piece reads as dice notation (the game-core's,
 *  the same the roll uses) and a member keeps at most `maxSaved` rolls per table.
 *
 *  Example: `new SavedRollRulesBo(SAVED_ROLLS_MAX).requireReadable(['1d20+5', '1d4'])` */
export class SavedRollRulesBo {
  constructor(private readonly maxSaved: number) {}

  /** Throws `INVALID_DICE_EXPRESSION` naming the piece (counted from 1, as the person sees the
   *  tray) with the game-core's reason, or the whole roll when the composition is refused
   *  (more than 10 pieces, more than 1000 dice summed).
   *
   *  Example: `rules.requireReadable(['1d20', '2d'])` → throws "part 2 ("2d") cannot be read: …" */
  requireReadable(expressions: readonly string[]): void {
    requireReadableDice(expressions);
  }

  /** Throws `SAVED_ROLLS_LIMIT` when one more roll would pass the ceiling.
   *
   *  Example: `rules.requireRoomFor(50)` → throws "saving would keep 51 of 50 …" */
  requireRoomFor(keptCount: number): void {
    const wanted = keptCount + 1;
    if (wanted <= this.maxSaved) return;
    throw new SavedRollsLimitError(wanted, this.maxSaved);
  }
}

/** Throws `SAVED_ROLL_FOLDERS_LIMIT` when one more folder would pass the ceiling.
 *
 *  Example: `requireFolderRoom(50, SAVED_ROLL_FOLDERS_MAX)` → throws "saving would keep 51 of 50 …" */
export function requireFolderRoom(keptCount: number, maxFolders: number): void {
  const wanted = keptCount + 1;
  if (wanted <= maxFolders) return;
  throw new SavedRollFoldersLimitError(wanted, maxFolders);
}
