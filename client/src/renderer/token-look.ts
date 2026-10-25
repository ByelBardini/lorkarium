import type { ConditionLookDto } from '@lorkarium/contracts';

/** How a token is drawn by its looks, its defeat and being hidden from the players: the alpha of
 *  its face (disc, art, initials), whether it goes grey, gets a dashed outline, sleeps ("z z"),
 *  or carries the crossed eye of a token the players do not receive. */
export type TokenLookStyle = Readonly<{
  alpha: number;
  grey: boolean;
  dashedOutline: boolean;
  sleeping: boolean;
  hiddenMark: boolean;
}>;

// The face fades so what is drawn over it (the cross, the outline) reads first.
const DEFEATED_ALPHA = 0.45;
const INVISIBLE_ALPHA = 0.45;
const UNCONSCIOUS_ALPHA = 0.6;
// Hidden is the master's secret, not a condition everyone sees: its own fade, and the eye mark
// instead of the dashed outline of "Invisível".
export const HIDDEN_ALPHA = 0.55;

/** The looks combined with the defeat and being hidden: the faintest alpha wins, the marks add up.
 *
 *  Example: `tokenLookStyle({ looks: view.looks, defeated: view.defeated, hidden: view.hidden }).alpha // 0.45` */
export function tokenLookStyle(
  token: Readonly<{ looks: readonly ConditionLookDto[]; defeated: boolean; hidden?: boolean }>,
): TokenLookStyle {
  const invisible = token.looks.includes('invisible');
  const unconscious = token.looks.includes('unconscious');
  const hidden = token.hidden === true;
  const alphas = [
    1,
    token.defeated ? DEFEATED_ALPHA : 1,
    invisible ? INVISIBLE_ALPHA : 1,
    unconscious ? UNCONSCIOUS_ALPHA : 1,
    hidden ? HIDDEN_ALPHA : 1,
  ];
  return {
    alpha: Math.min(...alphas),
    grey: unconscious,
    dashedOutline: invisible,
    sleeping: unconscious,
    hiddenMark: hidden,
  };
}
