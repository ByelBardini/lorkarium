import type { ConditionLookDto } from '@lorkarium/contracts';

/** How a token is drawn by its looks and its defeat: the alpha of its face (disc, art,
 *  initials), whether it goes grey, gets a dashed outline, or sleeps ("z z"). */
export type TokenLookStyle = Readonly<{
  alpha: number;
  grey: boolean;
  dashedOutline: boolean;
  sleeping: boolean;
}>;

// The face fades so what is drawn over it (the cross, the outline) reads first.
const DEFEATED_ALPHA = 0.45;
const INVISIBLE_ALPHA = 0.45;
const UNCONSCIOUS_ALPHA = 0.6;

/** The looks combined with the defeat: the faintest alpha wins, the marks add up.
 *
 *  Example: `tokenLookStyle({ looks: view.looks, defeated: view.defeated }).alpha // 0.45` */
export function tokenLookStyle(
  token: Readonly<{ looks: readonly ConditionLookDto[]; defeated: boolean }>,
): TokenLookStyle {
  const invisible = token.looks.includes('invisible');
  const unconscious = token.looks.includes('unconscious');
  const alphas = [
    1,
    token.defeated ? DEFEATED_ALPHA : 1,
    invisible ? INVISIBLE_ALPHA : 1,
    unconscious ? UNCONSCIOUS_ALPHA : 1,
  ];
  return {
    alpha: Math.min(...alphas),
    grey: unconscious,
    dashedOutline: invisible,
    sleeping: unconscious,
  };
}
