import type { ActiveConditionDto, BoardStateDto, CombatDto, TokenDto } from '@lorkarium/contracts';

/** The combat as the panel reads it: the token on turn and how many are in. */
export type CombatSummary = Readonly<{
  combat: CombatDto;
  current: TokenDto | null;
  count: number;
}>;

/** Example: `combatSummaryOf(board)?.current?.name // 'Kael'` */
export function combatSummaryOf(board: BoardStateDto | null): CombatSummary | null {
  const combat = board?.combat;
  if (!board || !combat) return null;
  const currentTokenId = combat.combatants.find(
    ({ id }) => id === combat.currentCombatantId,
  )?.tokenId;
  const current = board.tokens.find(({ id }) => id === currentTokenId) ?? null;
  return { combat, current, count: combat.combatants.length };
}

/** "Rodada 3 · Vez de Kael" (or just the round while nobody is on turn).
 *
 *  Example: `turnLine(summary) // 'Rodada 3 · Vez de Kael'` */
export function turnLine(summary: CombatSummary): string {
  const round = `Rodada ${summary.combat.round}`;
  return summary.current ? `${round} · Vez de ${summary.current.name}` : round;
}

/** "1 no combate" / "4 no combate". */
export function combatCountLabel(count: number): string {
  return `${count} no combate`;
}

/** A number with the typographic minus: "18", "−2". */
export function signedText(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : String(value);
}

/** The initiative as read only text: "18", "−2" or "—". */
export function initiativeText(value: number | null): string {
  return value === null ? '—' : signedText(value);
}

export const END_COMBAT_QUESTION = 'Encerrar o combate? A ordem e a rodada se perdem.';

/** "Envenenado · 2 rod." / "Concentrando · sem limite". */
export function conditionLabel(condition: ActiveConditionDto): string {
  const rounds =
    condition.remainingRounds === null ? 'sem limite' : `${condition.remainingRounds} rod.`;
  return `${condition.name} · ${rounds}`;
}
