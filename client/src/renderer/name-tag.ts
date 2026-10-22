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

const NAME_TAG_GAP = 4;

/** Where the name plate starts, in world px from the token's top edge: under the token, and
 *  under its condition strip when it has one.
 *
 *  Example: `nameTagTop(rect.height, strip.height) // 81 for a 1×1 token with icons` */
export function nameTagTop(tokenHeight: number, stripHeight: number): number {
  return tokenHeight + NAME_TAG_GAP + stripHeight;
}
