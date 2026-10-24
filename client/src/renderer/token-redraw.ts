import type { TokenArtView, TokenBarView, TokenView } from './token-view';

/** What of one token to draw again: its body (disc, art, rings, bar, mark, cross, look) and its
 *  name plate. The condition strip keeps its own key (`PixiConditionMarks`). */
export type TokenRedraw = Readonly<{ body: boolean; nameTag: boolean }>;

/** What else changed for the token besides its view. */
export type TokenRedrawCause = Readonly<{ artArrived?: boolean; hoverChanged?: boolean }>;

/** What a new view of a token asks to redraw, comparing only the fields each part reads: a new
 *  cell redraws nothing (the glide moves the sprite), a new name only the plate.
 *
 *  Example: `const { body, nameTag } = tokenRedrawOf(sprite.view, view)` */
export function tokenRedrawOf(
  before: TokenView,
  after: TokenView,
  cause: TokenRedrawCause = {},
): TokenRedraw {
  const resized = before.width !== after.width || before.height !== after.height;
  const selected = before.selected !== after.selected;
  return {
    body: Boolean(cause.artArrived) || resized || selected || bodyChanged(before, after),
    nameTag: Boolean(cause.hoverChanged) || resized || selected || before.name !== after.name,
  };
}

function bodyChanged(before: TokenView, after: TokenView): boolean {
  return (
    before.silhouette !== after.silhouette ||
    before.initials !== after.initials ||
    before.ring !== after.ring ||
    before.onTurn !== after.onTurn ||
    before.facing !== after.facing ||
    before.facingMark !== after.facingMark ||
    before.defeated !== after.defeated ||
    !sameBar(before.bar, after.bar) ||
    !sameArt(before.art, after.art) ||
    before.looks.join() !== after.looks.join()
  );
}

function sameBar(before: TokenBarView | null, after: TokenBarView | null): boolean {
  if (!before || !after) return before === after;
  return (
    before.fraction === after.fraction &&
    before.state === after.state &&
    before.excess === after.excess &&
    before.color === after.color
  );
}

function sameArt(before: TokenArtView | null, after: TokenArtView | null): boolean {
  if (!before || !after) return before === after;
  return (
    before.url === after.url &&
    before.frame === after.frame &&
    before.flipX === after.flipX &&
    before.flipY === after.flipY
  );
}
