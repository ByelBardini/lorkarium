import { PATROL_POINTS_MAX } from '@lorkarium/game-core';
import { boardCommandFailureMessage } from '@/features/board/board-messages';
import type { BoardCommandFailure } from '@/services/table-board-commands';

/** What the status line says of a point past the ceiling of a route. */
export const PATROL_POINTS_FULL = `Até ${PATROL_POINTS_MAX} pontos.`;

/** How the editor is used, under its title. */
export const PATROL_EDITOR_HINT =
  'Clique no mapa para somar pontos. Backspace tira o último, Enter salva, Esc cancela.';

/** The description of "Patrulhando" on a token with no route yet. */
export const NEEDS_PATROL_HINT = 'Desenhe uma patrulha primeiro.';

/** Example: `patrolPanelTitle('Kael')` → `'Patrulha de Kael'` */
export function patrolPanelTitle(tokenName: string): string {
  return `Patrulha de ${tokenName}`;
}

/** Why the editor's save or removal was refused; a point off the scene says so for the size.
 *
 *  Example: `patrolFailureMessage('out_of_scene')` */
export function patrolFailureMessage(failure: BoardCommandFailure): string {
  if (failure === 'out_of_scene') return 'Um ponto da rota sai da cena para este tamanho de token.';
  return boardCommandFailureMessage(failure);
}

/** What the status line says once "Patrulhando" was confirmed.
 *
 *  Example: `patrolsSwitchedAnnouncement(['Kael'], true)` → `'Kael patrulhando.'` */
export function patrolsSwitchedAnnouncement(names: readonly string[], active: boolean): string {
  const [only] = names;
  if (names.length === 1 && only) return active ? `${only} patrulhando.` : `${only} parado.`;
  return active ? `${names.length} tokens patrulhando.` : `${names.length} tokens parados.`;
}
