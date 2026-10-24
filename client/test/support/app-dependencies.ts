import type { AppDependencies } from '@/app/router';
import { tabInteractionFactory } from '@/features/board/tab-interaction';
import { createDrawingStyleStore } from '@/stores/drawing-style-store';
import { createEffectAreaStyleStore } from '@/stores/effect-area-style-store';
import { createWallStyleStore } from '@/stores/wall-style-store';
import { createLightColorStore } from '@/stores/light-color-store';
import { createLightReachStore } from '@/stores/light-reach-store';
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
import { InteractionClockFake } from './interaction-clock-fake';
import { LibraryApiFake } from './library-api-fake';
import { SceneActivationFake } from './scene-activation-fake';
import { StorageFake } from './storage-fake';
import { TableBoardCommandsFake } from './table-board-commands-fake';
import { TableSessionApiFake } from './table-session-api-fake';

export type TestDependencies = AppDependencies & {
  authApi: AuthApiFake;
  campaignsApi: CampaignsApiFake;
  libraryApi: LibraryApiFake;
  sceneActivation: SceneActivationFake;
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
  /** The `localStorage` under `lightReach`. */
  lightReachStorage: StorageFake;
  /** The `localStorage` under `lightColor`. */
  lightColorStorage: StorageFake;
  /** Every board renderer the room created, behind `createBoardRenderer`. */
  boardRenderers: BoardRenderersFake;
  boardCommands: TableBoardCommandsFake;
  /** The board's own time (the hover card's delay), moved by hand. */
  interactionClock: InteractionClockFake;
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
  const lightReachStorage = new StorageFake();
  const lightColorStorage = new StorageFake();
  const boardRenderers = new BoardRenderersFake();
  const boardCommands = new TableBoardCommandsFake();
  return {
    journal,
    authApi: new AuthApiFake(journal),
    campaignsApi: new CampaignsApiFake(),
    libraryApi: new LibraryApiFake(),
    sceneActivation: new SceneActivationFake(),
    assets: new AssetsApiFake(),
    clipboard: new ClipboardFake(),
    tableSessionApi,
    tabStorage,
    roomLayoutStorage,
    drawingStyleStorage,
    effectAreaStyleStorage,
    wallStyleStorage,
    lightReachStorage,
    lightColorStorage,
    boardRenderers,
    createBoardRenderer: boardRenderers.create,
    boardCommands,
    interactionClock: new InteractionClockFake(),
    openTables: createOpenTablesStore({
      api: tableSessionApi,
      storage: tabStorage,
      createInteraction: tabInteractionFactory(boardCommands),
    }),
    sessionStore: createSessionStore(),
    railStore: createRailStore(new StorageFake()),
    roomLayout: createRoomLayoutStore(roomLayoutStorage),
    drawingStyle: createDrawingStyleStore(drawingStyleStorage),
    effectAreaStyle: createEffectAreaStyleStore(effectAreaStyleStorage),
    wallStyle: createWallStyleStore(wallStyleStorage),
    lightReach: createLightReachStore(lightReachStorage),
    lightColor: createLightColorStore(lightColorStorage),
    now: () => TEST_NOW,
    random: () => 0,
  };
}
