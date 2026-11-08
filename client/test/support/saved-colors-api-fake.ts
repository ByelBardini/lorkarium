import { SAVED_COLORS_MAX, type HexColorDto } from '@lorkarium/contracts';
import type { SavedColorsApi, SavedColorsResult } from '@/services/saved-colors-api';
import { ScriptedAnswers } from './scripted-answers';

type Answers = {
  list: SavedColorsResult;
  save: SavedColorsResult;
  remove: SavedColorsResult;
};

/** A `SavedColorsApi` that keeps the list like the server would (most recent first, no repeats,
 *  up to the limit); any method can be scripted (`answers.answer`, `answers.hold`).
 *
 *  Example: `api.colors = ['#336699']; await api.save('#aabbcc')` */
export class SavedColorsApiFake implements SavedColorsApi {
  colors: readonly HexColorDto[] = [];
  readonly answers = new ScriptedAnswers<Answers>();

  list(): Promise<SavedColorsResult> {
    return this.answers.reply('list', null, () => this.current());
  }

  save(color: HexColorDto): Promise<SavedColorsResult> {
    return this.answers.reply('save', color, () => {
      if (this.colors.includes(color)) return this.current();
      if (this.colors.length >= SAVED_COLORS_MAX) {
        return { ok: false, failure: { kind: 'saved_colors_limit' } };
      }
      this.colors = [color, ...this.colors];
      return this.current();
    });
  }

  remove(color: HexColorDto): Promise<SavedColorsResult> {
    return this.answers.reply('remove', color, () => {
      this.colors = this.colors.filter((saved) => saved !== color);
      return this.current();
    });
  }

  private current(): SavedColorsResult {
    return { ok: true, value: this.colors };
  }
}

/** A full list: `SAVED_COLORS_MAX` different colors.
 *
 *  Example: `api.colors = fullSavedColors()` */
export function fullSavedColors(): readonly HexColorDto[] {
  return Array.from(
    { length: SAVED_COLORS_MAX },
    (_, index): HexColorDto => `#0000${index.toString(16).padStart(2, '0')}`,
  );
}
