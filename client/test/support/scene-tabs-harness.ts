import { createOpenTablesStore, type OpenTable } from '@/stores/open-tables-store';
import { ANA } from './auth-api-fake';
import { VHARN } from './campaigns-api-fake';
import { VHARN_CAST_ID } from './cast-fixtures';
import { TORRE_SCENE, torreBoard } from './scene-tab-fixtures';
import { StorageFake } from './storage-fake';
import { tabInteractions } from './tab-interactions';
import { TableBoardCommandsFake } from './table-board-commands-fake';
import type { TableSessionApiFake } from './table-session-api-fake';
import { vharnBoard, vharnState } from './table-session-fixtures';

/** VHARN opened by Ana over `api`, joined and with the group grid (Cena 1) loaded: the table
 *  whose grid tabs a test drives.
 *
 *  Example: `const table = openVharnTabs(api); table.tabs.getState().open(TORRE_SCENE.id)` */
export function openVharnTabs(
  api: TableSessionApiFake,
  storage: StorageFake = new StorageFake(),
  commands: TableBoardCommandsFake = new TableBoardCommandsFake(),
): OpenTable {
  const openTables = createOpenTablesStore({
    api,
    storage,
    createInteraction: tabInteractions(commands),
  });
  openTables.getState().restore(ANA.id);
  openTables
    .getState()
    .open({ campaignId: VHARN.id, name: VHARN.name, castSceneId: VHARN_CAST_ID });
  api.emitTo(
    VHARN.id,
    { kind: 'state', state: vharnState() },
    { kind: 'board', state: vharnBoard() },
  );
  const [table] = openTables.getState().tables;
  if (!table) throw new Error(`VHARN did not open; opened: ${api.opened}`);
  return table;
}

/** Opens the Torre as an extra tab of `table` and answers its watch with its snapshot.
 *
 *  Example: `openTorreTab(api, table)` */
export function openTorreTab(api: TableSessionApiFake, table: OpenTable): void {
  table.tabs.getState().open(TORRE_SCENE.id);
  api.emitToGrid(TORRE_SCENE.id, { kind: 'board', state: torreBoard() });
}
