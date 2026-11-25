/** A smiley is drawn at the text's size; a meme a little bigger. */
export type EmoteKind = 'smiley' | 'meme';

/** The picker's tabs, in order. */
export const EMOTE_CATEGORIES = [
  'reactions',
  'gestures',
  'rpg',
  'symbols',
  'monkeys',
  'memes',
] as const;

export type EmoteCategory = (typeof EMOTE_CATEGORIES)[number];

/** One picture the chat draws in place of its codes. `id` names the image file
 *  (`client/src/emotes/images/<id>.png`); the first code is the one the picker inserts;
 *  `unicode` is the emoji character typed from the keyboard, kept without U+FE0F. */
export type Emote = Readonly<{
  id: string;
  kind: EmoteKind;
  category: EmoteCategory;
  codes: readonly string[];
  /** Words the picker and the `:` list also find it by (pt-BR). */
  keywords: readonly string[];
  unicode: string | null;
}>;

type SmileyCategory = Exclude<EmoteCategory, 'memes'>;

/** A smiley with its own text codes (`:)`, `<3`).
 *
 *  Example: `smiley('heart', 'symbols', '❤', ['<3', ':heart:'], ['coracao'])` */
export function smiley(
  id: string,
  category: SmileyCategory,
  unicode: string,
  codes: readonly string[],
  keywords: readonly string[],
): Emote {
  return { id, kind: 'smiley', category, codes, keywords, unicode };
}

/** A Noto emoji whose only code is `:id:`.
 *
 *  Example: `noto('dice', 'rpg', '🎲', ['dado']).codes // [':dice:']` */
export function noto(
  id: string,
  category: SmileyCategory,
  unicode: string,
  keywords: readonly string[],
): Emote {
  return smiley(id, category, unicode, [`:${id}:`], keywords);
}

/** A meme: codes only, no keyboard character.
 *
 *  Example: `meme('doge', [':doge:']).category // 'memes'` */
export function meme(id: string, codes: readonly string[]): Emote {
  return { id, kind: 'meme', category: 'memes', codes, keywords: [], unicode: null };
}
