import { EMOTE_CATEGORIES, type Emote, type EmoteCategory, type EmoteKind } from './emote';
import { MEMES } from './emote-memes';
import { SMILEYS } from './emote-smileys';

export { EMOTE_CATEGORIES, MEMES, SMILEYS };
export type { Emote, EmoteCategory, EmoteKind };

/** Smileys first, then memes. */
export const EMOTES: readonly Emote[] = [...SMILEYS, ...MEMES];

const VARIATION_SELECTOR = /\u{FE0F}/gu;

const CATALOG_NAMES: ReadonlySet<string> = new Set(
  EMOTES.flatMap((emote) => emote.codes.filter(isNamedEmoteCode)).map((code) =>
    code.slice(1, -1).toLowerCase(),
  ),
);

const EMOTES_BY_UNICODE: ReadonlyMap<string, Emote> = new Map(
  EMOTES.flatMap((emote) => (emote.unicode === null ? [] : [[emote.unicode, emote] as const])),
);

/** A `:name:` code: matched without case (`:Doge:` is `:doge:`), and the only kind the `:`
 *  list offers.
 *
 *  Example: `isNamedEmoteCode(':doge:') // true; isNamedEmoteCode(':)') // false` */
export function isNamedEmoteCode(code: string): boolean {
  return /^:[^\s:]{2,}:$/u.test(code);
}

/** Whether a name (without the colons) is a `:name:` of the catalog, in any case: a custom
 *  emoji cannot take it.
 *
 *  Example: `isCatalogEmoteName('Doge') // true` */
export function isCatalogEmoteName(name: string): boolean {
  return CATALOG_NAMES.has(name.toLowerCase());
}

/** The emote drawn for a keyboard emoji, the U+FE0F selector ignored; `null` off the catalog.
 *
 *  Example: `emoteOfUnicode('🎲')?.id // 'dice'` */
export function emoteOfUnicode(character: string): Emote | null {
  return EMOTES_BY_UNICODE.get(character.replace(VARIATION_SELECTOR, '')) ?? null;
}

/** The emotes of one picker tab, in catalog order.
 *
 *  Example: `emotesIn('monkeys')[0]?.id // 'see_no_evil'` */
export function emotesIn(category: EmoteCategory): readonly Emote[] {
  return EMOTES.filter((emote) => emote.category === category);
}
