import type { BoardStateDto, CombatantDto, CombatDto, TokenDto } from '@lorkarium/contracts';
import { canRunEntry, entryLabelOf, entryTokensOf } from './combat-entries';

/** Another entry, as "Mover para" offers it. */
export type EntryChoice = Readonly<{ id: string; label: string }>;

/** One line of the tracker: the entry, its label and seen tokens, whether this viewer runs it,
 *  the other entries and the ties around it. */
export type TrackerRow = Readonly<{
  combatant: CombatantDto;
  label: string;
  tokens: readonly TokenDto[];
  others: readonly EntryChoice[];
  canRun: boolean;
  tiedAbove: boolean;
  tiedBelow: boolean;
}>;

export type SummedBar = Readonly<{ current: number; max: number }>;

/** The tracker lines in the server's order, named only by the seen tokens (`seenTokensOf`).
 *
 *  Example: `trackerRowsOf(board, seenTokensOf(board, sight), isMaster)[0]?.label // 'Kael'` */
export function trackerRowsOf(
  state: BoardStateDto,
  seenTokens: readonly TokenDto[],
  isMaster: boolean,
): TrackerRow[] {
  const combatants = state.combat?.combatants ?? [];
  const labels = combatants.map((entry) => ({
    id: entry.id,
    label: entryLabelOf(entry, seenTokens),
  }));
  return combatants.map((combatant, index) => {
    const tied = (offset: number): boolean =>
      combatants[index + offset]?.initiative === combatant.initiative;
    return {
      combatant,
      label: labels[index]?.label ?? '',
      tokens: entryTokensOf(combatant, seenTokens),
      others: labels.filter(({ id }) => id !== combatant.id),
      canRun: canRunEntry(combatant, state.tokens, isMaster),
      tiedAbove: tied(-1),
      tiedBelow: tied(1),
    };
  });
}

/** "5 de 6 de pé": the tokens not marked defeated. */
export function standingTextOf(tokens: readonly TokenDto[]): string {
  const standing = tokens.filter(({ defeated }) => !defeated).length;
  return `${standing} de ${tokens.length} de pé`;
}

/** The position-0 bars this viewer received, added up; `null` when none came (a hidden bar is
 *  not in the token at all). Example: `summedBarOf(bandits) // { current: 42, max: 60 }` */
export function summedBarOf(tokens: readonly TokenDto[]): SummedBar | null {
  const bars = tokens.flatMap(({ bars }) => bars.filter(({ position }) => position === 0));
  if (bars.length === 0) return null;
  const current = bars.reduce((total, bar) => total + bar.current, 0);
  return { current, max: bars.reduce((total, bar) => total + bar.max, 0) };
}

/** "A seguir: Bandido", or "A seguir: Kael · rodada 3" from the last of the order; `null` while
 *  nobody is on turn. Example: `upNextTextOf(board.combat, seenTokens)` */
export function upNextTextOf(combat: CombatDto, seenTokens: readonly TokenDto[]): string | null {
  const index = currentIndexOf(combat);
  if (index < 0) return null;
  const closing = index === combat.combatants.length - 1;
  const next = combat.combatants[closing ? 0 : index + 1];
  if (!next) return null;
  const label = `A seguir: ${entryLabelOf(next, seenTokens)}`;
  return closing ? `${label} · rodada ${combat.round + 1}` : label;
}

/** "Fechar rodada 2" on the last of the order, "Próximo turno" otherwise. */
export function nextTurnLabelOf(combat: CombatDto): string {
  const index = currentIndexOf(combat);
  const closing = index >= 0 && index === combat.combatants.length - 1;
  return closing ? `Fechar rodada ${combat.round}` : 'Próximo turno';
}

function currentIndexOf(combat: CombatDto): number {
  return combat.combatants.findIndex(({ id }) => id === combat.currentCombatantId);
}
