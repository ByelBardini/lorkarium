import type { AppDependencies } from '@/app/router';
import { createDrawingStyleStore } from '@/stores/drawing-style-store';
import { createEffectAreaStyleStore } from '@/stores/effect-area-style-store';
import { createWallStyleStore } from '@/stores/wall-style-store';
import { createOpenTablesStore } from '@/stores/open-tables-store';
import { createRailStore } from '@/stores/rail-store';
import { createRoomLayoutStore } from '@/stores/room-layout-store';
import { createSessionStore } from '@/stores/session-store';
import { AssetsApiFake } from './assets-api-fake';
import { AuthApiFake } from './auth-api-fake';
import { BoardRenderersFake } from './board-renderer-fake';
import { CallJournal } from './call-journal';
import { CampaignsApiFake } from './campaigns-api-fake';
import { ClipboardFake } from './clipboard-fake';
import { StorageFake } from './storage-fake';
import { TableBoardCommandsFake } from './table-board-commands-fake';
import { TableSessionApiFake } from './table-session-api-fake';

export type TestDependencies = AppDependencies & {
  authApi: AuthApiFake;
  campaignsApi: CampaignsApiFake;
  assets: AssetsApiFake;
  clipboard: ClipboardFake;
  /** The session api under `openTables`, for specs to play the server. */
  tableSessionApi: TableSessionApiFake;
  /** The `sessionStorage` under `openTables`. */
  tabStorage: StorageFake;
  /** The `localStorage` under `roomLayout`. */
  roomLayoutStorage: StorageFake;
  /** The `localStorage` under `drawingStyle`. */
  drawingStyleStorage: StorageFake;
  /** The `localStorage` under `effectAreaStyle`. */
  effectAreaStyleStorage: StorageFake;
  /** The `localStorage` under `wallStyle`. */
  wallStyleStorage: StorageFake;
  /** Every board renderer the room created, behind `createBoardRenderer`. */
  boardRenderers: BoardRenderersFake;
  boardCommands: TableBoardCommandsFake;
  /** Where the auth and table session fakes write, in call order. */
  journal: CallJournal;
};

// Wednesday, 14 October 2026, local time: the date the overline is written against.
export const TEST_NOW = new Date(2026, 9, 14, 20, 0);

/** Every dependency of the router as a fake, with a fixed clock and the first greeting drawn.
 *
 *  Example: `const deps = testDependencies(); createMemoryRouter(buildRoutes(deps), …)` */
export function testDependencies(): TestDependencies {
  const journal = new CallJournal();
  const tableSessionApi = new TableSessionApiFake(journal);
  const tabStorage = new StorageFake();
  const roomLayoutStorage = new StorageFake();
  const drawingStyleStorage = new StorageFake();
  const effectAreaStyleStorage = new StorageFake();
  const wallStyleStorage = new StorageFake();
  const boardRenderers = new BoardRenderersFake();
  return {
    journal,
    authApi: new AuthApiFake(journal),
    campaignsApi: new CampaignsApiFake(),
    assets: new AssetsApiFake(),
    clipboard: new ClipboardFake(),
    tableSessionApi,
    tabStorage,
    roomLayoutStorage,
    drawingStyleStorage,
    effectAreaStyleStorage,
    wallStyleStorage,
    boardRenderers,
    createBoardRenderer: boardRenderers.create,
    boardCommands: new TableBoardCommandsFake(),
    openTables: createOpenTablesStore({ api: tableSessionApi, storage: tabStorage }),
    sessionStore: createSessionStore(),
    railStore: createRailStore(new StorageFake()),
    roomLayout: createRoomLayoutStore(roomLayoutStorage),
    drawingStyle: createDrawingStyleStore(drawingStyleStorage),
    effectAreaStyle: createEffectAreaStyleStore(effectAreaStyleStorage),
    wallStyle: createWallStyleStore(wallStyleStorage),
    now: () => TEST_NOW,
    random: () => 0,
  };
}
