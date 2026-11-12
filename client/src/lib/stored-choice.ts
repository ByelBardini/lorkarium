import { isHexColor, type HexColorDto } from '@lorkarium/contracts';

/** The part of `localStorage` a remembered choice needs; injected so tests and blocked storage work. */
export type ChoiceStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** A remembered UI choice, or `fallback` when nothing valid is stored or the storage throws
 *  (private mode, blocked site data): a preference is a convenience, never state.
 *
 *  Example: `readStoredChoice(storage, 'lorkarium.rail', ['expanded', 'collapsed'], 'expanded')` */
export function readStoredChoice<Choice extends string>(
  storage: ChoiceStorage,
  key: string,
  choices: readonly Choice[],
  fallback: Choice,
): Choice {
  const stored = storedTextOf(storage, key);
  return choices.find((choice) => choice === stored) ?? fallback;
}

/** A remembered color: a name of `palette` or a custom hex, or `fallback` for anything else, so a
 *  text edited in the storage never reaches a style.
 *
 *  Example: `readStoredColor(storage, 'lorkarium.stroke', ['gold', 'steel'], 'gold')` */
export function readStoredColor<Name extends string>(
  storage: ChoiceStorage,
  key: string,
  palette: readonly Name[],
  fallback: Name | HexColorDto,
): Name | HexColorDto {
  const stored = storedTextOf(storage, key);
  if (stored !== null && isHexColor(stored)) return stored;
  return palette.find((name) => name === stored) ?? fallback;
}

const DECIMAL_TEXT = /^-?\d+(\.\d+)?$/;

/** A remembered number written as plain decimal text that `accepts` approves, or `fallback` for
 *  anything else (`'12px'`, `'1e3'`, `'Infinity'`, a refused value, a storage that throws).
 *
 *  Example: `readStoredNumber(storage, 'lorkarium.roomChatHeight', (h) => h > 0, 330)` */
export function readStoredNumber(
  storage: ChoiceStorage,
  key: string,
  accepts: (value: number) => boolean,
  fallback: number,
): number {
  const stored = storedTextOf(storage, key);
  if (stored === null || !DECIMAL_TEXT.test(stored)) return fallback;
  const value = Number(stored);
  return accepts(value) ? value : fallback;
}

function storedTextOf(storage: ChoiceStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** Remembers `value` under `key`; a storage that throws keeps the choice in memory only.
 *
 *  Example: `writeStoredChoice(storage, 'lorkarium.roomPanel', 'closed')` */
export function writeStoredChoice(storage: ChoiceStorage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // Keeps working in memory for this visit.
  }
}
