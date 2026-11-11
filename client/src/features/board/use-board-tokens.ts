import type { TokenDto } from '@lorkarium/contracts';
import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { BoardStore } from '@/stores/board-store';

const NO_TOKENS: readonly TokenDto[] = [];

// Where a token stands and looks: what a move, a group move or a turn changes.
const POSE_FIELDS: ReadonlySet<string> = new Set(['col', 'row', 'facing']);

/** The board's tokens for a panel that never shows where they stand (the tracker, the
 *  conditions of the selection, the roster): the same array while the tokens only moved or
 *  turned, so `token:moved` renders none of them. A new token, a renamed one, a bar or a
 *  condition hands the new array.
 *
 *  Example: `const tokens = useTokensBesidesPose(board)` */
export function useTokensBesidesPose(board: StoreApi<BoardStore>): readonly TokenDto[] {
  const shown = useRef<readonly TokenDto[]>(NO_TOKENS);
  const snapshot = useCallback((): readonly TokenDto[] => {
    const now = board.getState().board?.tokens ?? NO_TOKENS;
    if (!sameTokensBesidesPose(shown.current, now)) shown.current = now;
    return shown.current;
  }, [board]);
  return useSyncExternalStore(board.subscribe, snapshot);
}

/** Whether two token lists differ only by where the tokens stand or look, in the same order.
 *
 *  Example: `sameTokensBesidesPose(before, after) // true after a token:moved` */
export function sameTokensBesidesPose(
  before: readonly TokenDto[],
  after: readonly TokenDto[],
): boolean {
  if (before === after) return true;
  if (before.length !== after.length) return false;
  return before.every((token, index) => sameBesidesPose(token, after[index]));
}

function sameBesidesPose(before: TokenDto, after: TokenDto | undefined): boolean {
  if (before === after) return true;
  if (!after) return false;
  const fields = Object.keys(before) as (keyof TokenDto)[];
  if (fields.length !== Object.keys(after).length) return false;
  return fields.every((field) => POSE_FIELDS.has(field) || before[field] === after[field]);
}
