import type { StoreApi } from 'zustand/vanilla';
import type { BoardIntent } from '@/renderer/board-renderer';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import { stampCondition } from '@/stores/condition-tool-flow';
import { conditionChoiceOf, type ConditionToolStore } from '@/stores/condition-tool-store';

export type ConditionIntentStores = Readonly<{
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  conditionTool: StoreApi<ConditionToolStore>;
}>;

/** Routes the condition tool's press on a token to one stamp with the tool's current choice (Shift
 *  takes it off). Answers whether the intent was that press.
 *
 *  Example: `if (routeConditionIntent({ board, interaction, conditionTool }, intent)) return;` */
export function routeConditionIntent(stores: ConditionIntentStores, intent: BoardIntent): boolean {
  if (intent.kind !== 'conditionStamped') return false;
  const context = {
    board: stores.board.getState().board,
    choice: conditionChoiceOf(stores.conditionTool.getState()),
    interaction: stores.interaction.getState(),
  };
  void stampCondition({ tokenId: intent.tokenId, removes: intent.removes }, context);
  return true;
}
