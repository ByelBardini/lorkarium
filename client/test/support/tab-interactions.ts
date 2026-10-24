import { tabInteractionFactory } from '@/features/board/tab-interaction';
import type { CreateTabInteraction } from '@/stores/scene-tabs-store';
import { TableBoardCommandsFake } from './table-board-commands-fake';

/** The interaction of each grid tab over board commands the test plays (a fresh fake unless one
 *  is given), for an open tables store built outside `testDependencies()`.
 *
 *  Example: `createOpenTablesStore({ api, storage, createInteraction: tabInteractions() })` */
export function tabInteractions(
  commands: TableBoardCommandsFake = new TableBoardCommandsFake(),
): CreateTabInteraction {
  return tabInteractionFactory(commands);
}
