import type { CharacterDto, TokenBarDto, TokenDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import type { BoardStore } from '@/stores/board-store';
import { characterOfUser, type CharactersStore } from '@/stores/characters-store';

/** The character that holds a sheet: the id stays in the host (the frame gets the rest). */
export type SheetCharacterView = Readonly<{
  id: string;
  name: string;
  armorClass: number | null;
  difficultyClass: number | null;
}>;

/** What the frame learns of the sheet's holder (a token or a character); the bars are the
 *  viewer's (already redacted). `character` is `null` for a loose token. */
export type SheetTokenView = Readonly<{
  name: string;
  imageAssetId: string | null;
  bars: readonly TokenBarDto[];
  character: SheetCharacterView | null;
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
  const viewOf = memoizedView((token: TokenDto) => ({ ...token, character: null }));
  return {
    current: () => viewOf(boards.map(tokenIn).find((token) => token !== undefined) ?? null),
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
  const viewOf = memoizedView((character: CharacterDto) => ({
    ...character,
    character: {
      id: character.id,
      name: character.name,
      armorClass: character.armorClass,
      difficultyClass: character.difficultyClass,
    },
  }));
  return {
    current: () => viewOf(characterOfUser(characters.getState().characters, userId)),
    subscribe: (listener) => characters.subscribe(listener),
  };
}

// The same view while the store keeps the same object: a new one tells the host to look again.
function memoizedView<T extends object>(
  toView: (item: T) => SheetHolderView,
): (item: T | null) => SheetHolderView | null {
  let last: Readonly<{ item: T; view: SheetHolderView }> | null = null;
  return (item) => {
    if (item === null) return null;
    if (last?.item !== item) last = { item, view: toView(item) };
    return last.view;
  };
}
