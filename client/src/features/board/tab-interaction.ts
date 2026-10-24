import type { TableBoardCommands } from '@/services/table-board-commands';
import { createBoardInteractionStore } from '@/stores/board-interaction-store';
import type { CreateTabInteraction } from '@/stores/scene-tabs-store';
import { tokenCommandFailureMessage } from './board-messages';

/** How each grid tab gets its interaction: the room's commands and its refusal messages, over
 *  the tab's scope and undo stack.
 *
 *  Example: `createOpenTablesStore({ api, storage, createInteraction: tabInteractionFactory(commands) })` */
export function tabInteractionFactory(commands: TableBoardCommands): CreateTabInteraction {
  return (tab) =>
    createBoardInteractionStore({
      ...tab,
      commands,
      describeRefusal: tokenCommandFailureMessage,
    });
}
