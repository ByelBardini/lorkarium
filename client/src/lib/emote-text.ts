import { EMOTES, isNamedEmoteCode, type Emote } from './emote-catalog';

/** A run of a message: plain text, or one code drawn as its picture (`code` as typed). */
export type EmotePiece =
  | Readonly<{ kind: 'text'; text: string }>
  | Readonly<{ kind: 'emote'; emote: Emote; code: string }>;

type CodeEntry = Readonly<{ code: string; emote: Emote; named: boolean }>;

// A code counts only on its own: after a space (or the start) and before a space, the end or a
// punctuation mark. So `10:30`, `http://` and `a:b` stay text.
const BEFORE_CODE = /\s/u;
const AFTER_CODE = /[\s.,!?;]/u;

const CODES_BY_START = indexCodes(EMOTES);

/** The message cut into text and pictures; the longest code wins (`:-D` over `:-`).
 *
 *  Example: `emotePiecesOf('oi :D').map((piece) => piece.kind) // ['text', 'emote']` */
export function emotePiecesOf(text: string): EmotePiece[] {
  const pieces: EmotePiece[] = [];
  let plainFrom = 0;
  let at = 0;
  while (at < text.length) {
    const found = codeAt(text, at);
    if (found === null) {
      at += 1;
      continue;
    }
    pushText(pieces, text.slice(plainFrom, at));
    pieces.push({
      kind: 'emote',
      emote: found.emote,
      code: text.slice(at, at + found.code.length),
    });
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
  const pictured = pieces.some((piece) => piece.kind === 'emote');
  return pictured && pieces.every((piece) => piece.kind === 'emote' || piece.text.trim() === '');
}

function codeAt(text: string, at: number): CodeEntry | null {
  if (at > 0 && !BEFORE_CODE.test(text.charAt(at - 1))) return null;
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
