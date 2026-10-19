import type { BoardStateDto, CombatantDto, CombatDto, TokenDto } from '@lorkarium/contracts';
import { entryLabelOf } from '@/lib/combat-entries';

/** The combat as the panel reads it: the entry on turn, its label and how many entries are in. */
export type CombatSummary = Readonly<{
  combat: CombatDto;
  current: CombatantDto | null;
  /** "Inimigos", "Kael", "Fora de vista"; `null` while nobody is on turn. */
  currentLabel: string | null;
  count: number;
}>;

/** The entry on turn, named by the tokens this viewer sees (`seenTokensOf`).
 *
 *  Example: `combatSummaryOf(board, seenTokens)?.currentLabel // 'Inimigos'` */
export function combatSummaryOf(
  board: BoardStateDto | null,
  seenTokens: readonly TokenDto[],
): CombatSummary | null {
  const combat = board?.combat;
  if (!board || !combat) return null;
  const current = combat.combatants.find(({ id }) => id === combat.currentCombatantId) ?? null;
  const currentLabel = current ? entryLabelOf(current, seenTokens) : null;
  return { combat, current, currentLabel, count: combat.combatants.length };
}

/** "Rodada 3 · Vez de Inimigos" (or just the round while nobody is on turn).
 *
 *  Example: `turnLine(summary) // 'Rodada 3 · Vez de Kael'` */
export function turnLine(summary: CombatSummary): string {
  const round = `Rodada ${summary.combat.round}`;
  return summary.currentLabel ? `${round} · Vez de ${summary.currentLabel}` : round;
}

/** Read after a fallen token's name ("Goblin, morto") and an entry whose tokens all fell. */
export const DEFEATED_TOKEN_SUFFIX = ', morto';
export const DEFEATED_ENTRY_SUFFIX = ', todos mortos';

/** Every token of the entry fell; an entry with no token (a lair) never does.
 *
 *  Example: `entryDefeated([goblin, wolf]) // true when both are defeated` */
export function entryDefeated(tokens: readonly TokenDto[]): boolean {
  return tokens.length > 0 && tokens.every(({ defeated }) => defeated);
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
