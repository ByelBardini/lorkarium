// Connectives that never stand for a name: "Ogro das Cinzas" is OC, not OD.
const CONNECTIVES = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o']);

/** The initials drawn on a token: the first letter of the first two words that are not
 *  connectives, or the first two letters of a single word. Editable in the token dialog.
 *
 *  Example: `initialsOf('Ogro das Cinzas') // 'OC'` */
export function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word && !CONNECTIVES.has(word.toLowerCase()));
  const [first, second] = words;
  if (!first) return '';
  const letters = second ? `${first.charAt(0)}${second.charAt(0)}` : first.slice(0, 2);
  return letters.toLocaleUpperCase('pt-BR');
}
