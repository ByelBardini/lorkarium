import type { CustomEmojiRefDto, Emote } from '@lorkarium/contracts';
import { emotePiecesOf } from '@/lib/emote-text';
import type { Point } from './camera';

/** A piece of a balloon's line: a word or an emote's picture; `spaced` when a space follows it
 *  (drawn as a gap: PixiJS measures a `Text` without its trailing space). */
export type SpeechRun =
  | Readonly<{ kind: 'word'; text: string; spaced: boolean }>
  | Readonly<{ kind: 'emote'; emote: Emote; spaced: boolean }>
  | Readonly<{ kind: 'custom'; emojiId: string; spaced: boolean }>;

/** The measured size of one run, in screen px, and the gap after it (a space, or 0). */
export type FlowSize = Readonly<{ width: number; height: number; gapAfter: number }>;

/** Where each run goes (same order as the sizes) and the size of the whole line. */
export type FlowLayout = Readonly<{ positions: readonly Point[]; width: number; height: number }>;

type FlowEntry = Readonly<{ index: number; size: FlowSize }>;

/** A balloon's line cut into words and pictures, so it can wrap between them.
 *
 *  Example: `speechRunsOf('Ha :D').map((run) => run.kind) // ['word', 'emote']` */
export function speechRunsOf(
  text: string,
  customEmojis: readonly CustomEmojiRefDto[] = [],
): SpeechRun[] {
  const runs: SpeechRun[] = [];
  for (const piece of emotePiecesOf(text, customEmojis)) {
    if (piece.kind === 'text') pushWords(runs, piece.text);
    else if (piece.kind === 'emote')
      runs.push({ kind: 'emote', emote: piece.emote, spaced: false });
    else runs.push({ kind: 'custom', emojiId: piece.emojiId, spaced: false });
  }
  return runs;
}

/** Lays the runs left to right, starting a row when the next one passes `maxWidth` (a run wider
 *  than that gets a row of its own); each run is centered on its row's height. A gap at the end
 *  of a row takes no width.
 *
 *  Example: `flowSpeechItems([{ width: 30, height: 20, gapAfter: 4 }, { width: 20, height: 26, gapAfter: 0 }], 216).positions // [{ x: 0, y: 3 }, { x: 34, y: 0 }]` */
export function flowSpeechItems(sizes: readonly FlowSize[], maxWidth: number): FlowLayout {
  const positions: Point[] = sizes.map(() => ({ x: 0, y: 0 }));
  let top = 0;
  let width = 0;
  for (const row of rowsOf(sizes, maxWidth)) {
    const height = Math.max(...row.map(({ size }) => size.height));
    let x = 0;
    for (const { index, size } of row) {
      positions[index] = { x, y: top + (height - size.height) / 2 };
      width = Math.max(width, x + size.width);
      x += size.width + size.gapAfter;
    }
    top += height;
  }
  return { positions, width, height: top };
}

function pushWords(runs: SpeechRun[], text: string): void {
  for (const part of text.split(/(\s+)/u)) {
    if (part === '') continue;
    if (/^\s/u.test(part)) markSpaced(runs);
    else runs.push({ kind: 'word', text: part, spaced: false });
  }
}

// A space before anything (the line's start) has nothing to follow: dropped.
function markSpaced(runs: SpeechRun[]): void {
  const last = runs.at(-1);
  if (last) runs[runs.length - 1] = { ...last, spaced: true };
}

function rowsOf(sizes: readonly FlowSize[], maxWidth: number): FlowEntry[][] {
  const rows: FlowEntry[][] = [];
  let row: FlowEntry[] = [];
  let x = 0;
  sizes.forEach((size, index) => {
    if (row.length > 0 && x + size.width > maxWidth) {
      rows.push(row);
      row = [];
      x = 0;
    }
    row.push({ index, size });
    x += size.width + size.gapAfter;
  });
  if (row.length > 0) rows.push(row);
  return rows;
}
