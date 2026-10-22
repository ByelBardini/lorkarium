import type { ConditionLookDto, ConditionToneDto } from '@lorkarium/contracts';

type Weighed = Readonly<{ tone: ConditionToneDto }>;
type Looking = Weighed & Readonly<{ look: ConditionLookDto | null }>;

// What weighs most on the turn comes first: it is what the table looks for on a crowded token.
const SEVERITY: Readonly<Record<ConditionToneDto, number>> = {
  incapacitating: 0,
  harm: 1,
  benefit: 2,
};

/** The conditions from the heaviest to the lightest (incapacitating, harm, benefit), in the
 *  order they came inside each tone.
 *
 *  Example: `conditionsBySeverity(token.conditions)[0]?.name // 'Paralisado'` */
export function conditionsBySeverity<C extends Weighed>(conditions: readonly C[]): C[] {
  return conditions.toSorted((a, b) => SEVERITY[a.tone] - SEVERITY[b.tone]);
}

/** Splits the conditions of a token into the looks they give it (translucent, greyed out; each
 *  once, in the order they came) and the marks left for the strip, by severity.
 *
 *  Example: `tokenLooksOf(token.conditions).looks // ['invisible']` */
export function tokenLooksOf<C extends Looking>(
  conditions: readonly C[],
): Readonly<{ looks: ConditionLookDto[]; marks: C[] }> {
  const looks = [...new Set(conditions.flatMap(({ look }) => (look ? [look] : [])))];
  const marks = conditionsBySeverity(conditions.filter(({ look }) => look === null));
  return { looks, marks };
}

/** The conditions as a list reads them: the ones that change the token first (they are what the
 *  eye sees on the board), then the rest by severity.
 *
 *  Example: `conditionsAsListed(kael.conditions).map(({ name }) => name) // ['Invisível', 'Paralisado', …]` */
export function conditionsAsListed<C extends Looking>(conditions: readonly C[]): C[] {
  const looking = conditions.filter(({ look }) => look !== null);
  return [...looking, ...tokenLooksOf(conditions).marks];
}
