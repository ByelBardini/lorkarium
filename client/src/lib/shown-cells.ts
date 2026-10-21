import type { TokenLanding } from './light-sources';

type PlacedToken = Readonly<{ tokenId: string; col: number; row: number }>;

/** What moves tokens off their confirmed cell for this viewer: other people's drags (by id), the
 *  move this viewer dropped and waits the server for, and this viewer's drag (`landing: null`
 *  when a member would leave the scene). */
export type ShownCellsInput = Readonly<{
  dragged: Readonly<Record<string, Readonly<{ col: number; row: number }>>>;
  preview: readonly PlacedToken[];
  drag: Readonly<{ landing: readonly PlacedToken[] | null }> | null;
}>;

/** Where each token shows right now for this viewer, when off its confirmed cell. Later sources
 *  override earlier ones: other people's drags, then the move waiting for the server, then this
 *  viewer's drag (what the hand holds is where the token is drawn).
 *
 *  Example: `boardSightOf(board, { previewEyeIds, landing: shownCellsOf({ dragged, preview, drag }) })` */
export function shownCellsOf({ dragged, preview, drag }: ShownCellsInput): TokenLanding {
  const shown = new Map<string, Readonly<{ col: number; row: number }>>();
  for (const [tokenId, { col, row }] of Object.entries(dragged)) shown.set(tokenId, { col, row });
  for (const { tokenId, col, row } of [...preview, ...(drag?.landing ?? [])])
    shown.set(tokenId, { col, row });
  return shown;
}
