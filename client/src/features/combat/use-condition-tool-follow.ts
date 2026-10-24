import type { ConditionDefinitionDto } from '@lorkarium/contracts';
import { useEffect } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { parseRounds } from '@/lib/numeric-text';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import { CONDITION_HINT } from '@/stores/board-tool-state';
import { INVALID_ROUNDS_NOTICE, pickedDefinitionOf } from '@/stores/condition-tool-flow';
import type { ConditionToolChoice, ConditionToolStore } from '@/stores/condition-tool-store';
import { roundsLeftText } from './combat-view';

export type ConditionToolFollowStores = Readonly<{
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  conditionTool: StoreApi<ConditionToolStore>;
}>;

/** The status line while the condition tool is on: what a click stamps, or what is missing.
 *
 *  A stacking condition says a click adds a stack and Shift+click takes one off.
 *
 *  Example: `conditionToolHintOf(envenenado, '2') // 'Clique num token para aplicar Envenenado (2 rodadas); Shift+clique tira.'` */
export function conditionToolHintOf(
  definition: ConditionDefinitionDto | null,
  roundsText: string,
): string {
  if (!definition) return CONDITION_HINT;
  const rounds = parseRounds(roundsText);
  if (rounds === 'invalid') return INVALID_ROUNDS_NOTICE;
  const lasting = roundsLeftText(rounds === 0 ? null : rounds);
  if (definition.maxStacks !== null) {
    return `Clique soma 1 stack de ${definition.name} (${lasting}); Shift+clique tira 1.`;
  }
  return `Clique num token para aplicar ${definition.name} (${lasting}); Shift+clique tira.`;
}

/** Keeps the condition tool in step with the table while the room is open (see
 *  `followConditionTool`); with no table yet it does nothing.
 *
 *  Example: `useConditionToolFollow(table ? { board: table.board, interaction, conditionTool } : null)` */
export function useConditionToolFollow(stores: ConditionToolFollowStores | null): void {
  const board = stores?.board ?? null;
  const interaction = stores?.interaction ?? null;
  const conditionTool = stores?.conditionTool ?? null;
  useEffect(() => {
    if (!board || !interaction || !conditionTool) return;
    return followConditionTool({ board, interaction, conditionTool });
  }, [board, interaction, conditionTool]);
}

/** A picked condition deleted from the table's list is unpicked; while the tool is on, a new
 *  choice says itself on the status line, and the tool's generic hint (a tool switch, Esc) is
 *  replaced by the picked one. Answers the unsubscribe.
 *
 *  Example: `const stop = followConditionTool({ board, interaction, conditionTool })` */
export function followConditionTool(stores: ConditionToolFollowStores): () => void {
  const stops = [
    stores.board.subscribe(() => dropDeletedPick(stores)),
    stores.conditionTool.subscribe(() => sayChoice(stores, false)),
    stores.interaction.subscribe(() => sayChoice(stores, true)),
  ];
  dropDeletedPick(stores);
  sayChoice(stores, true);
  return () => stops.forEach((stop) => stop());
}

// Before the first snapshot there is no list to judge the pick by.
function dropDeletedPick({ board, conditionTool }: ConditionToolFollowStores): void {
  const confirmed = board.getState().board;
  const { conditionId } = conditionTool.getState();
  if (!confirmed || !conditionId || pickedDefinitionOf(confirmed, conditionId)) return;
  conditionTool.getState().pick(null);
}

// `onlyOverGeneric`: the interaction changed by itself, so only its own generic hint is replaced
// (a refusal or another notice stays).
function sayChoice(stores: ConditionToolFollowStores, onlyOverGeneric: boolean): void {
  const local = stores.interaction.getState();
  if (local.tool !== 'conditions') return;
  if (onlyOverGeneric && local.notice !== CONDITION_HINT) return;
  const hint = hintOfChoice(stores, stores.conditionTool.getState());
  if (hint !== local.notice) local.say(hint);
}

function hintOfChoice(stores: ConditionToolFollowStores, choice: ConditionToolChoice): string {
  const definition = pickedDefinitionOf(stores.board.getState().board, choice.conditionId);
  return conditionToolHintOf(definition, choice.roundsText);
}
