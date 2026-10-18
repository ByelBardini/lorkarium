/** What a key means while the board itself has the focus (the camera keys are the renderer's). */
export type BoardKey =
  | 'next'
  | 'previous'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'open'
  | 'delete'
  | 'turnBack'
  | 'turnOn';

export type BoardKeyPress = Readonly<{
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}>;

const BOARD_KEY: Readonly<Record<string, BoardKey>> = {
  ']': 'next',
  '[': 'previous',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'open',
  Delete: 'delete',
  Backspace: 'delete',
  q: 'turnBack',
  Q: 'turnBack',
  e: 'turnOn',
  E: 'turnOn',
};

/** ] and [ walk the tokens, the arrows move the selected one a cell, Enter opens its card,
 *  Q and E turn the selection 45° (E clockwise, beside W A S D), Delete and Backspace delete
 *  the selected drawings. Tab
 *  is never taken, so the focus always leaves the board.
 *
 *  Example: `boardKeyOf(event) // 'next' for ]` */
export function boardKeyOf(press: BoardKeyPress): BoardKey | null {
  if (press.ctrlKey || press.metaKey || press.altKey) return null;
  return BOARD_KEY[press.key] ?? null;
}

type Placed = Readonly<{ id: string; name: string; col: number; row: number }>;

/** Tokens as a reader meets them: top to bottom, left to right, then by name.
 *
 *  Example: `readingOrder(board.tokens).map(({ id }) => id)` */
export function readingOrder<T extends Placed>(tokens: readonly T[]): T[] {
  return [...tokens].sort(
    (a, b) => a.row - b.row || a.col - b.col || a.name.localeCompare(b.name, 'pt-BR'),
  );
}

/** The id after (or before) `current` in `order`, wrapping around; from nothing, the first
 *  (or the last).
 *
 *  Example: `stepFrom(ids, singleSelectedOf(selectedTokenIds), 'next')` */
export function stepFrom(
  order: readonly string[],
  current: string | null,
  direction: 'next' | 'previous',
): string | null {
  if (order.length === 0) return null;
  const index = current === null ? -1 : order.indexOf(current);
  if (index === -1) return (direction === 'next' ? order[0] : order.at(-1)) ?? null;
  const step = direction === 'next' ? 1 : -1;
  return order[(index + step + order.length) % order.length] ?? null;
}
