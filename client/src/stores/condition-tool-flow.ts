import type { BoardStateDto, ConditionDefinitionDto, TokenDto } from '@lorkarium/contracts';
import { parseRounds } from '@/lib/numeric-text';
import type { BoardInteractionStore } from './board-interaction-store';
import type { ConditionToolChoice } from './condition-tool-store';

export const NO_CONDITION_PICKED = 'Escolha uma condição.';
export const INVALID_ROUNDS_NOTICE = 'Rodadas vão de 0 a 99.';

/** The token pressed with the condition tool, and whether Shift asked to take the condition off. */
export type ConditionStampTarget = Readonly<{ tokenId: string; removes: boolean }>;

/** What a stamp reads: the confirmed board (the list of the table and the token's conditions), the
 *  tool's choice, and the interaction that sends (nothing while read only; a refusal goes to the
 *  status line through its `describeRefusal`). */
export type ConditionStampContext = Readonly<{
  board: BoardStateDto | null;
  choice: ConditionToolChoice;
  interaction: Pick<BoardInteractionStore, 'readOnly' | 'say' | 'command'>;
}>;

/** A press of the condition tool on a token: one `applyCondition` with the picked condition and
 *  rounds (a token that already has it gets it again, which renews the duration; a stacking one
 *  also gains a stack, on the server), or with Shift one stack less (`setConditionStacks`) of a
 *  stacking active one with more than 1, else one `removeCondition` of it. Nothing picked, wrong rounds or a Shift on a token
 *  without it only say why; read only does nothing.
 *
 *  Example: `await stampCondition({ tokenId: kael.id, removes: false }, { board, choice, interaction })` */
export async function stampCondition(
  target: ConditionStampTarget,
  { board, choice, interaction }: ConditionStampContext,
): Promise<void> {
  if (interaction.readOnly || !board) return;
  const definition = pickedDefinitionOf(board, choice.conditionId);
  if (!definition) return interaction.say(NO_CONDITION_PICKED);
  const token = board.tokens.find(({ id }) => id === target.tokenId);
  if (!token) return;
  if (target.removes) return removeStamp(token, definition, interaction);
  const rounds = parseRounds(choice.roundsText);
  if (rounds === 'invalid') return interaction.say(INVALID_ROUNDS_NOTICE);
  await interaction.command((commands, scope) =>
    commands.applyCondition(scope, token.id, definition.id, rounds),
  );
}

/** The picked condition while it is still on the table's list; `null` once deleted or unpicked.
 *
 *  Example: `pickedDefinitionOf(board, choice.conditionId)?.name // 'Envenenado'` */
export function pickedDefinitionOf(
  board: Pick<BoardStateDto, 'conditionDefinitions'> | null,
  conditionId: string | null,
): ConditionDefinitionDto | null {
  if (!board || !conditionId) return null;
  return board.conditionDefinitions.find(({ id }) => id === conditionId) ?? null;
}

/** What the status line says when Shift+click finds nothing to take off.
 *
 *  Example: `missingConditionNotice('Kael', 'Envenenado') // 'Kael não tem Envenenado.'` */
export function missingConditionNotice(tokenName: string, conditionName: string): string {
  return `${tokenName} não tem ${conditionName}.`;
}

async function removeStamp(
  token: TokenDto,
  definition: ConditionDefinitionDto,
  interaction: ConditionStampContext['interaction'],
): Promise<void> {
  const active = token.conditions.find(({ conditionId }) => conditionId === definition.id);
  if (!active) return interaction.say(missingConditionNotice(token.name, definition.name));
  if (active.maxStacks !== null && active.stacks > 1) {
    await interaction.command((commands, scope) =>
      commands.setConditionStacks(scope, token.id, active.id, active.stacks - 1),
    );
    return;
  }
  await interaction.command((commands, scope) =>
    commands.removeCondition(scope, token.id, active.id),
  );
}
