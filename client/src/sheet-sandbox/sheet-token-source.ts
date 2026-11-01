import type { TokenBarDto, TokenDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import type { BoardStore } from '@/stores/board-store';
import { characterOfUser, type CharactersStore } from '@/stores/characters-store';

/** What the frame learns of the sheet's holder (a token or a character); the bars are the
 *  viewer's (already redacted). */
export type SheetTokenView = Readonly<{
  name: string;
  imageAssetId: string | null;
  bars: readonly TokenBarDto[];
}>;

/** Where the host reads the sheet's holder: `current()` keeps the same object while nothing
 *  changed, so a new one means the frame needs a new `state`. */
export interface SheetTokenSource {
  current(): SheetTokenView | null;
  subscribe(listener: () => void): () => void;
}

/** The holder as the room knows it: also whether the viewer controls it. */
export type SheetHolderView = SheetTokenView & Readonly<{ canControl: boolean }>;

/** A source that also tells whether the viewer controls the holder (the room's tokens and
 *  characters do). */
export interface SheetHolderSource extends SheetTokenSource {
  current(): SheetHolderView | null;
}

/** A loose token as one board store holds it (a character's sheet reads the character instead,
 *  `characterSource`).
 *
 *  Example: `boardTokenSource(table.board, sheet.tokenId)` */
export function boardTokenSource(board: StoreApi<BoardStore>, tokenId: string): SheetHolderSource {
  return firstTokenSource([board], tokenId);
}

/** The loose token from the first of `boards` that has it (the grids the table has open). The
 *  same object while nothing changed.
 *
 *  Example: `firstTokenSource(tabs.map((tab) => tab.board), sheet.tokenId)` */
export function firstTokenSource(
  boards: readonly StoreApi<BoardStore>[],
  tokenId: string,
): SheetHolderSource {
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

/** The character of the player `userId` (a sheet held by a character names its player in
 *  `memberId`), from the open table's stream (`OpenTable.characters`): `null` until its first
 *  sync or while this viewer does not see it. The same object while it did not change.
 *
 *  Example: `characterSource(table.characters, sheet.memberId)` */
export function characterSource(
  characters: StoreApi<CharactersStore>,
  userId: string,
): SheetHolderSource {
  return {
    current: () => characterOfUser(characters.getState().characters, userId),
    subscribe: (listener) => characters.subscribe(listener),
  };
}
