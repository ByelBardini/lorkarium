/** What the rules read of an emoji row. */
export type EmojiOrderKey = Readonly<{ id: string; createdAt: Date }>;

/** What a message needs of an active emoji. */
export type ActiveEmoji = Readonly<{ id: string; name: string }>;

/** An emoji a message uses: its `:name:` and its id (the event's shape, built by the mapper). */
export type EmojiUse = Readonly<{ name: string; emojiId: string }>;

/** The name pattern and how many names one message takes, passed in from the contract. */
export type EmojiNameRules = Readonly<{ pattern: RegExp; perMessage: number }>;

// A `:word:` between colons; the name pattern decides afterwards. A stray match (`10:30:00` holds
// `:30:`) only becomes a picture if the sender has an emoji of that name.
const COLON_WORD = /:([^\s:]+):/gu;

/** The ids that still work: the oldest ones, by `(createdAt, id)`, up to the plan's ceiling
 *  (`null` = all). Past it the newest stop working; none is deleted.
 *
 *  Example: `activeEmojiIdsOf(rows, 10).has(row.id)` */
export function activeEmojiIdsOf(
  rows: readonly EmojiOrderKey[],
  limit: number | null,
): ReadonlySet<string> {
  const ordered = [...rows].sort(byCreation);
  const kept = limit === null ? ordered : ordered.slice(0, limit);
  return new Set(kept.map((each) => each.id));
}

/** The custom emoji names a text uses, each once, lower-cased, in order, at most `perMessage`.
 *
 *  Example: `customEmojiNamesIn('oi :Festa:', rules) // ['festa']` */
export function customEmojiNamesIn(text: string, rules: EmojiNameRules): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(COLON_WORD)) {
    const name = (match[1] ?? '').toLowerCase();
    if (rules.pattern.test(name)) names.add(name);
    if (names.size === rules.perMessage) break;
  }
  return [...names];
}

/** The sender's active emojis a text uses, as the message carries them.
 *
 *  Example: `customEmojiRefsIn('oi :festa:', [{ id, name: 'festa' }], rules) // [{ name: 'festa', emojiId: id }]` */
export function customEmojiRefsIn(
  text: string,
  active: readonly ActiveEmoji[],
  rules: EmojiNameRules,
): EmojiUse[] {
  const byName = new Map(active.map((emoji) => [emoji.name, emoji.id]));
  return customEmojiNamesIn(text, rules).flatMap((name) => {
    const emojiId = byName.get(name);
    return emojiId === undefined ? [] : [{ name, emojiId }];
  });
}

function byCreation(a: EmojiOrderKey, b: EmojiOrderKey): number {
  const byTime = a.createdAt.getTime() - b.createdAt.getTime();
  if (byTime !== 0) return byTime;
  return a.id < b.id ? -1 : 1;
}
