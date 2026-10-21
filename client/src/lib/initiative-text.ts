const MINUS = '−';

/** The initiative typed in a field: a whole number in −999…999 (the typographic minus counts),
 *  `null` when empty, `'invalid'` otherwise. One parser for the tracker and the preparation.
 *
 *  Example: `parseInitiative('−2') // -2` */
export function parseInitiative(text: string): number | null | 'invalid' {
  const trimmed = text.trim().replace(MINUS, '-');
  if (trimmed === '') return null;
  if (!/^-?\d{1,3}$/.test(trimmed)) return 'invalid';
  return Number(trimmed);
}
