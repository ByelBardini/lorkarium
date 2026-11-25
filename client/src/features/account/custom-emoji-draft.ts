/** What is being made: the name as typed and the picture chosen (shown in the preview too). */
export type EmojiDraft = Readonly<{ name: string; picture: File | null }>;

export const EMPTY_EMOJI_DRAFT: EmojiDraft = { name: '', picture: null };
