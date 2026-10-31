import type { TokenBarDto, TokenDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import type { BoardStore } from '@/stores/board-store';

/** What the frame learns of the sheet's token; the bars are the viewer's (already redacted). */
export type SheetTokenView = Readonly<{
  name: string;
  imageAssetId: string | null;
  bars: readonly TokenBarDto[];
}>;

/** Where the host reads the sheet's token: `current()` keeps the same object while nothing
 *  changed, so a new one means the frame needs a new `state`. */
export interface SheetTokenSource {
  current(): SheetTokenView | null;
  subscribe(listener: () => void): () => void;
}

/** A source that also tells whether the viewer controls the token (the room's tokens do). */
export interface BoardTokenSource extends SheetTokenSource {
  current(): TokenDto | null;
}

/** The token as one board store holds it. A sheet lives on the anchor of a character, so the
 *  table's cast store (`OpenTable.cast`, followed while the table is open) is the source there;
 *  a loose token is read from the store of its grid.
 *
 *  Example: `boardTokenSource(table.cast, sheet.tokenId)` */
export function boardTokenSource(board: StoreApi<BoardStore>, tokenId: string): BoardTokenSource {
  return firstTokenSource([board], tokenId);
}

/** The token from the first of `boards` that has it: the cast first (an anchor), then the grids
 *  the table has open (a loose token). The same object while nothing changed.
 *
 *  Example: `firstTokenSource([table.cast, table.board], sheet.tokenId)` */
export function firstTokenSource(
  boards: readonly StoreApi<BoardStore>[],
  tokenId: string,
): BoardTokenSource {
  const tokenIn = (board: StoreApi<BoardStore>): TokenDto | undefined =>
    board.getState().board?.tokens.find((token) => token.id === tokenId);
  return {
    current: () => boards.map(tokenIn).find((token) => token !== undefined) ?? null,
    subscribe: (listener) => {
      const unsubscribers = boards.map((board) => board.subscribe(listener));
      return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    },
  };
}
