import { EMOTES, isNamedEmoteCode, type Emote } from './emote-catalog';
import { searchText } from './search-text';

/** One line of the `:` list: the emote and the `:name:` code accepting writes. */
export type EmoteSuggestion = Readonly<{ emote: Emote; code: string }>;

/** How many emotes the `:` list shows at most. */
export const EMOTE_SUGGESTION_LIMIT = 8;

/** The emotes with a `:name:` code, or a keyword, starting with what was typed after the `:` (no
 *  accent, no case), in the catalog's order. The code shown is the one that matched, or the
 *  emote's first `:name:` when a keyword did.
 *
 *  Example: `suggestEmotes('dog')[0]?.code // ':doge:'` */
export function suggestEmotes(typed: string): EmoteSuggestion[] {
  const folded = searchText(typed);
  return EMOTES.flatMap((emote) => {
    const code = matchingCodeOf(emote, folded);
    return code === null ? [] : [{ emote, code }];
  }).slice(0, EMOTE_SUGGESTION_LIMIT);
}

/** The emotes of the picker's search: any code or keyword containing what was typed (no accent,
 *  no case); a blank search keeps them all.
 *
 *  Example: `searchEmotes(MEMES, 'god').map((emote) => emote.id) // ['ohgodwhy']` */
export function searchEmotes(emotes: readonly Emote[], typed: string): Emote[] {
  const folded = searchText(typed.trim());
  if (folded === '') return [...emotes];
  return emotes.filter((emote) =>
    [...emote.codes, ...emote.keywords].some((word) => searchText(word).includes(folded)),
  );
}

/** The field after putting `code` at the caret, with a space before when glued to a word (a code
 *  only counts on its own) and one after, and where the caret goes.
 *
 *  Example: `withEmoteCode('oi', 2, ':doge:') // { draft: 'oi :doge: ', caret: 10 }` */
export function withEmoteCode(
  draft: string,
  caret: number,
  code: string,
): Readonly<{ draft: string; caret: number }> {
  const before = draft.slice(0, caret);
  const glued = before !== '' && !/\s$/u.test(before);
  const insert = `${glued ? ' ' : ''}${code} `;
  return { draft: before + insert + draft.slice(caret), caret: caret + insert.length };
}

function matchingCodeOf(emote: Emote, folded: string): string | null {
  const named = emote.codes.filter(isNamedEmoteCode);
  const byCode = named.find((code) => searchText(code.slice(1)).startsWith(folded));
  if (byCode !== undefined) return byCode;
  const byKeyword = emote.keywords.some((word) => word.startsWith(folded));
  return byKeyword ? (named[0] ?? null) : null;
}
