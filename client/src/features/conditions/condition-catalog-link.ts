import type {
  ConditionColorDto,
  ConditionDefinitionDto,
  ConditionIconDto,
  ConditionLookDto,
  ConditionToneDto,
} from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import { boardCommandFailureMessage } from '@/features/board/board-messages';
import { conditionSuggestions, orderedByTone } from '@/lib/condition-names';
import type {
  BoardCommandFailure,
  TableBoardCommands,
  TableScope,
} from '@/services/table-board-commands';
import type { AssetsApi } from '@/services/assets-api';
import type { CharactersStore } from '@/stores/characters-store';

/** What the "Condições da mesa" page needs from the open table: its table stream (whose list of
 *  conditions is the table's, live), where to address the commands, the commands themselves and
 *  where a condition's image goes up.
 *
 *  Example: `<ConditionCatalogPage link={{ scope, table, commands, assets }} />` */
export type ConditionCatalogLink = Readonly<{
  /** The table: the list's commands act on the table stream's version, never on a grid. */
  scope: TableScope;
  /** The open table's stream (`OpenTable.characters`): the list, in its version. */
  table: StoreApi<CharactersStore>;
  commands: TableBoardCommands;
  /** Uploads the image of a condition (`purpose: 'condition'`) to the table of `scope`. */
  assets: AssetsApi;
}>;

/** Why the server refused a change to the table's list, as the master reads it.
 *
 *  Example: `catalogFailureMessage('token_not_found') // 'Essa condição não está mais na lista.'` */
export function catalogFailureMessage(failure: BoardCommandFailure): string {
  // CONDITION_NOT_FOUND shares the token's failure on the board; here it can only be the condition.
  if (failure === 'token_not_found') return 'Essa condição não está mais na lista.';
  return boardCommandFailureMessage(failure);
}

/** What the deletion confirmation says about the tokens that lose the condition.
 *
 *  Example: `usageText(2) // 'Está em 2 tokens. Ela sai de todos.'` */
export function usageText(tokens: number): string {
  if (tokens === 0) return 'Nenhum token tem essa condição.';
  if (tokens === 1) return 'Está em 1 token.';
  return `Está em ${tokens} tokens. Ela sai de todos.`;
}

/** A condition as the form edits it: what the master can change. */
export type ConditionFormValues = Readonly<{
  name: string;
  tone: ConditionToneDto;
  icon: ConditionIconDto;
  /** `null`: painted by its tone. */
  color: ConditionColorDto | null;
  look: ConditionLookDto | null;
  description: string;
  /** `null`: it does not stack, only lasts; 2 to 99: it piles up to that. */
  maxStacks: number | null;
  /** `null`: the icon alone; an asset of the table: its picture, the icon as the fallback. */
  imageAssetId: string | null;
}>;

/** What "Nova condição" starts from: the picker's defaults (a harm, the plain mark). */
export const NEW_CONDITION_VALUES: ConditionFormValues = {
  name: '',
  tone: 'harm',
  icon: 'circle-dot',
  color: null,
  look: null,
  description: '',
  maxStacks: null,
  imageAssetId: null,
};

/** The list's order: by nature (benefits, incapacitating, harms), by name inside each, only the
 *  names matching what was searched. The editor opens the first one of it.
 *
 *  Example: `conditionsInListOrder(definitions, '')[0] // the top item of the list` */
export function conditionsInListOrder(
  definitions: readonly ConditionDefinitionDto[],
  query: string,
): ConditionDefinitionDto[] {
  return orderedByTone(conditionSuggestions(definitions, query));
}
