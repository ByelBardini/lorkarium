import {
  EMOTES,
  emoteOfUnicode,
  isNamedEmoteCode,
  type CustomEmojiRefDto,
  type Emote,
} from '@lorkarium/contracts';

/** A run of a message: plain text, one code of the catalog drawn as its picture, or one of the
 *  sender's custom emojis (`code` as typed). */
export type EmotePiece =
  | Readonly<{ kind: 'text'; text: string }>
  | Readonly<{ kind: 'emote'; emote: Emote; code: string }>
  | Readonly<{ kind: 'custom'; emojiId: string; code: string }>;

type CodeEntry = Readonly<{ code: string; named: boolean }> &
  (Readonly<{ emote: Emote }> | Readonly<{ emojiId: string }>);

// A code counts only on its own: after a space (or the start) and before a space, the end or a
// punctuation mark. So `10:30`, `http://` and `a:b` stay text.
const BEFORE_CODE = /\s/u;
const AFTER_CODE = /[\s.,!?;]/u;

const CODES_BY_START = indexCodes(EMOTES);

const VARIATION_SELECTOR = '\u{FE0F}';
const ZERO_WIDTH_JOINER = 0x200d;
const SKIN_TONES = { first: 0x1f3fb, last: 0x1f3ff } as const;

/** The message cut into text and pictures; the longest code wins (`:-D` over `:-`). The sender's
 *  custom emojis come with the message (`customEmojis` of the event): a `:name:` it does not
 *  carry stays text.
 *
 *  Example: `emotePiecesOf('oi :D').map((piece) => piece.kind) // ['text', 'emote']` */
export function emotePiecesOf(
  text: string,
  customEmojis: readonly CustomEmojiRefDto[] = [],
): EmotePiece[] {
  const custom = customEmojis.map((ref) => ({
    code: `:${ref.name}:`,
    emojiId: ref.emojiId,
    named: true,
  }));
  const pieces: EmotePiece[] = [];
  let plainFrom = 0;
  let at = 0;
  while (at < text.length) {
    const found = unicodeAt(text, at) ?? codeAt(text, at, custom);
    if (found === null) {
      at += 1;
      continue;
    }
    pushText(pieces, text.slice(plainFrom, at));
    pieces.push(pieceOf(found, text.slice(at, at + found.code.length)));
    at += found.code.length;
    plainFrom = at;
  }
  pushText(pieces, text.slice(plainFrom));
  return pieces;
}

/** Whether the message is only pictures (and spaces): drawn bigger, like a sticker.
 *
 *  Example: `emotesOnly(emotePiecesOf(':vish: :D')) // true` */
export function emotesOnly(pieces: readonly EmotePiece[]): boolean {
  const pictured = pieces.some((piece) => piece.kind !== 'text');
  return pictured && pieces.every((piece) => piece.kind !== 'text' || piece.text.trim() === '');
}

function pieceOf(found: CodeEntry, code: string): EmotePiece {
  if ('emojiId' in found) return { kind: 'custom', emojiId: found.emojiId, code };
  return { kind: 'emote', emote: found.emote, code };
}

function unicodeAt(text: string, at: number): CodeEntry | null {
  const point = text.codePointAt(at);
  if (point === undefined || point < 0x80) return null;
  const character = String.fromCodePoint(point);
  const emote = emoteOfUnicode(character);
  if (emote === null) return null;
  const selected = text.startsWith(VARIATION_SELECTOR, at + character.length);
  const typed = selected ? character + VARIATION_SELECTOR : character;
  if (extendsEmoji(text.codePointAt(at + typed.length))) return null;
  return { code: typed, emote, named: false };
}

// A joiner or a skin tone after the emoji makes it part of a bigger one the catalog lacks.
function extendsEmoji(point: number | undefined): boolean {
  if (point === undefined) return false;
  return point === ZERO_WIDTH_JOINER || (point >= SKIN_TONES.first && point <= SKIN_TONES.last);
}

function codeAt(text: string, at: number, custom: readonly CodeEntry[]): CodeEntry | null {
  if (at > 0 && !BEFORE_CODE.test(text.charAt(at - 1))) return null;
  const mine = custom.find((entry) => matchesAt(text, at, entry));
  if (mine !== undefined) return mine;
  const candidates = CODES_BY_START.get(text.charAt(at).toLowerCase()) ?? [];
  return candidates.find((entry) => matchesAt(text, at, entry)) ?? null;
}

function matchesAt(text: string, at: number, entry: CodeEntry): boolean {
  const typed = text.slice(at, at + entry.code.length);
  const same = entry.named
    ? typed.toLowerCase() === entry.code.toLowerCase()
    : typed === entry.code;
  const after = text.charAt(at + entry.code.length);
  return same && (after === '' || AFTER_CODE.test(after));
}

function pushText(pieces: EmotePiece[], text: string): void {
  if (text !== '') pieces.push({ kind: 'text', text });
}

function indexCodes(emotes: readonly Emote[]): ReadonlyMap<string, readonly CodeEntry[]> {
  const entries = emotes.flatMap((emote) =>
    emote.codes.map((code) => ({ code, emote, named: isNamedEmoteCode(code) })),
  );
  entries.sort((a, b) => b.code.length - a.code.length);
  const index = new Map<string, CodeEntry[]>();
  for (const entry of entries) {
    const start = entry.code.charAt(0).toLowerCase();
    index.set(start, [...(index.get(start) ?? []), entry]);
  }
  return index;
}
