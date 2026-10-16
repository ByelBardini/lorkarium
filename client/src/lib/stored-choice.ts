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
  try {
    const stored = storage.getItem(key);
    return choices.find((choice) => choice === stored) ?? fallback;
  } catch {
    return fallback;
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
