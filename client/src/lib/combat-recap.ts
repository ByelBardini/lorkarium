import type { BoardStateDto, TokenDto } from '@lorkarium/contracts';

/** The board as the store held it, with how many snapshots arrived (a new snapshot is not news). */
export type RecapFrame = Readonly<{ board: BoardStateDto | null; snapshots: number }>;

/** What a confirmed change of turn told the table: "Rodada 3 começou.", "Envenenado acabou em
 *  Lyra." (only for the seen tokens, never naming a hidden one), or, when the combat ended,
 *  "Combate encerrado depois de 3 rodadas."; `[]` when the turn moved with nothing to tell.
 *  `null` when it is no change of turn (a snapshot, the same turn, no combat before).
 *
 *  Example: `combatRecapOf(previous, next, seenTokensOf(next.board, sight))` */
export function combatRecapOf(
  before: RecapFrame,
  after: RecapFrame,
  seenTokens: readonly TokenDto[],
): string[] | null {
  const was = before.board?.combat;
  if (!was || after.snapshots !== before.snapshots) return null;
  const now = after.board?.combat;
  if (!now) return [`Combate encerrado depois de ${roundsText(was.round)}.`];
  if (now.round === was.round && now.currentCombatantId === was.currentCombatantId) return null;
  const opened = now.round > was.round ? [`Rodada ${now.round} começou.`] : [];
  return [...opened, ...expiredLines(before.board, seenTokens)];
}

function roundsText(round: number): string {
  return round === 1 ? '1 rodada' : `${round} rodadas`;
}

function expiredLines(board: BoardStateDto | null, seenTokens: readonly TokenDto[]): string[] {
  return seenTokens.flatMap((token) => {
    const had = board?.tokens.find(({ id }) => id === token.id)?.conditions ?? [];
    const gone = had.filter(({ id }) => !token.conditions.some((kept) => kept.id === id));
    return gone.map(({ name }) => `${name} acabou em ${token.name}.`);
  });
}
