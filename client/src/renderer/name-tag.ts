import type { TokenView } from './board-view';

/** Whether a token shows its name under it: while hovered or selected, to every viewer.
 *
 *  Example: `showsNameTag(view, hoveredId) // true for the token under the pointer` */
export function showsNameTag(
  view: Pick<TokenView, 'id' | 'selected'>,
  hoveredId: string | null,
): boolean {
  return view.selected || view.id === hoveredId;
}
