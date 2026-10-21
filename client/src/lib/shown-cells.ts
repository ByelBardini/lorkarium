import type { TokenLanding, TokenPose } from './light-sources';

type PlacedToken = Readonly<{ tokenId: string; col: number; row: number }>;
type Cells = Readonly<{ col: number; row: number }>;

/** What moves or turns tokens off their confirmed pose for this viewer: other people's drags (by
 *  id), the move this viewer dropped and waits the server for, this viewer's drag (`landing: null`
 *  when a member would leave the scene), the turn this viewer shows before the ack (the handle,
 *  Q/E), and the confirmed tokens (the cell and facing the rest keeps). */
export type ShownCellsInput = Readonly<{
  dragged: Readonly<Record<string, Cells>>;
  preview: readonly PlacedToken[];
  drag: Readonly<{ landing: readonly PlacedToken[] | null }> | null;
  facingPreview: Readonly<Record<string, number>>;
  tokens: readonly Readonly<{ id: string; col: number; row: number; facing: number }>[];
}>;

/** Where each token shows right now for this viewer and where it looks, when off its confirmed
 *  pose. Later cell sources override earlier ones: other people's drags, then the move waiting for
 *  the server, then this viewer's drag (what the hand holds is where the token is drawn); the
 *  facing preview turns it wherever it shows. A token not on the board is left out.
 *
 *  Example: `boardSightOf(board, { previewEyeIds, landing: shownCellsOf({ dragged, preview, drag, facingPreview, tokens }) })` */
export function shownCellsOf(input: ShownCellsInput): TokenLanding {
  const cells = cellsShownOf(input);
  const shown = new Map<string, TokenPose>();
  for (const token of input.tokens) {
    const turned = input.facingPreview[token.id];
    const moved = cells.get(token.id);
    if (turned === undefined && !moved) continue;
    const { col, row } = moved ?? token;
    shown.set(token.id, { col, row, facing: turned ?? token.facing });
  }
  return shown;
}

function cellsShownOf({ dragged, preview, drag }: ShownCellsInput): Map<string, Cells> {
  const cells = new Map<string, Cells>();
  for (const [tokenId, { col, row }] of Object.entries(dragged)) cells.set(tokenId, { col, row });
  for (const { tokenId, col, row } of [...preview, ...(drag?.landing ?? [])])
    cells.set(tokenId, { col, row });
  return cells;
}
