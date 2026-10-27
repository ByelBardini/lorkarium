import type { AppDependencies } from '@/app/router';
import { tabInteractionFactory } from '@/features/board/tab-interaction';
import { createDrawingStyleStore } from '@/stores/drawing-style-store';
import { createEffectAreaStyleStore } from '@/stores/effect-area-style-store';
import { createWallStyleStore } from '@/stores/wall-style-store';
import { createLightColorStore } from '@/stores/light-color-store';
import { createAuraMotionStore } from '@/stores/aura-motion-store';
import { createLightReachStore } from '@/stores/light-reach-store';
import { createOpenTablesStore } from '@/stores/open-tables-store';
import { createRailStore } from '@/stores/rail-store';
import { createRoomLayoutStore } from '@/stores/room-layout-store';
import { createSessionStore } from '@/stores/session-store';
import { createAppUpdateStore } from '@/stores/app-update-store';
import { createDicePreferencesStore } from '@/stores/dice-preferences-store';
import { AccountLinksApiFake } from './account-links-api-fake';
import { AccountSecurityApiFake } from './account-security-api-fake';
import { UserAdminApiFake } from './user-admin-api-fake';
import { AssetsApiFake } from './assets-api-fake';
import { AuthApiFake } from './auth-api-fake';
import { BoardRenderersFake } from './board-renderer-fake';
import { CallJournal } from './call-journal';
import { CampaignsApiFake } from './campaigns-api-fake';
import { DiceCommandsFake } from './dice-commands-fake';
import { DiceRenderersFake } from './dice-renderer-fake';
import { DiceSoundsFake } from './dice-sound-fake';
import { ClipboardFake } from './clipboard-fake';
import { FieldEditingFake } from './field-editing-fake';
import { InteractionClockFake } from './interaction-clock-fake';
import { LibraryApiFake } from './library-api-fake';
import { SceneActivationFake } from './scene-activation-fake';
import { StorageFake } from './storage-fake';
import { PingCommandsFake } from './ping-commands-fake';
import { ProfileApiFake } from './profile-api-fake';
import { PageReloadFake, PublishedBuildFake } from './published-build-fake';
import { RetryWaitFake } from './retry-wait-fake';
import { SavedRollsApiFake } from './saved-rolls-api-fake';
import { TableBoardCommandsFake } from './table-board-commands-fake';
import { TableSessionApiFake } from './table-session-api-fake';

export type TestDependencies = AppDependencies & {
  authApi: AuthApiFake;
  campaignsApi: CampaignsApiFake;
  profileApi: ProfileApiFake;
  accountSecurityApi: AccountSecurityApiFake;
  userAdminApi: UserAdminApiFake;
  accountLinksApi: AccountLinksApiFake;
  libraryApi: LibraryApiFake;
  sceneActivation: SceneActivationFake;
  assets: AssetsApiFake;
  clipboard: ClipboardFake;
  fieldEditing: FieldEditingFake;
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
  /** The `localStorage` under `auraMotion`. */
  auraMotionStorage: StorageFake;
  /** Every board renderer the room created, behind `createBoardRenderer`. */
  boardRenderers: BoardRenderersFake;
  boardCommands: TableBoardCommandsFake;
  pings: PingCommandsFake;
  dice: DiceCommandsFake;
  /** The same fake as `interactionClock`: moving it reveals the rolls of the history. */
  diceClock: InteractionClockFake;
  savedRolls: SavedRollsApiFake;
  /** The `localStorage` under `dicePreferences`. */
  dicePreferencesStorage: StorageFake;
  /** Every dice renderer the room created, behind `createDiceRenderer`. */
  diceRenderers: DiceRenderersFake;
  /** Every dice sound the room created, behind `createDiceSound`. */
  diceSounds: DiceSoundsFake;
  /** The board's own time (the hover card's delay), moved by hand. */
  interactionClock: InteractionClockFake;
  /** Where the auth and table session fakes write, in call order. */
  journal: CallJournal;
  /** The boot retry pauses behind `waitBeforeRetry`, released by hand. */
  retryWaits: RetryWaitFake;
  /** The build the server publishes, under `appUpdate` (the page runs `TEST_BUILD`). */
  publishedBuild: PublishedBuildFake;
  /** The reloads asked through `reloadPage`. */
  pageReloads: PageReloadFake;
};

/** The client build every spec's page runs, and the server publishes until a spec deploys. */
export const TEST_BUILD = '/assets/index-test.js';

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
  const auraMotionStorage = new StorageFake();
  const dicePreferencesStorage = new StorageFake();
  const interactionClock = new InteractionClockFake();
  const boardRenderers = new BoardRenderersFake();
  const diceRenderers = new DiceRenderersFake();
  const diceSounds = new DiceSoundsFake();
  const boardCommands = new TableBoardCommandsFake();
  const retryWaits = RetryWaitFake.held();
  const publishedBuild = new PublishedBuildFake(TEST_BUILD);
  const pageReloads = new PageReloadFake();
  return {
    journal,
    retryWaits,
    waitBeforeRetry: retryWaits.wait,
    authApi: new AuthApiFake(journal),
    campaignsApi: new CampaignsApiFake(),
    profileApi: new ProfileApiFake(),
    accountSecurityApi: new AccountSecurityApiFake(TEST_NOW),
    userAdminApi: new UserAdminApiFake(TEST_NOW),
    accountLinksApi: new AccountLinksApiFake(),
    libraryApi: new LibraryApiFake(),
    sceneActivation: new SceneActivationFake(),
    assets: new AssetsApiFake(),
    clipboard: new ClipboardFake(),
    // The browser by default: specs of the desktop field menu turn it on.
    isDesktop: false,
    // No title bar of our own: specs of the desktop title bar pass a `DesktopWindowFake`.
    desktopWindow: null,
    fieldEditing: new FieldEditingFake(),
    tableSessionApi,
    tabStorage,
    roomLayoutStorage,
    drawingStyleStorage,
    effectAreaStyleStorage,
    wallStyleStorage,
    lightReachStorage,
    lightColorStorage,
    auraMotionStorage,
    boardRenderers,
    createBoardRenderer: boardRenderers.create,
    boardCommands,
    pings: new PingCommandsFake(),
    dice: new DiceCommandsFake(),
    // One fake clock for the board and the dice: a spec reveals a roll by `advance`.
    diceClock: interactionClock,
    savedRolls: new SavedRollsApiFake(),
    dicePreferencesStorage,
    dicePreferences: createDicePreferencesStore(dicePreferencesStorage),
    diceRenderers,
    createDiceRenderer: diceRenderers.create,
    diceSounds,
    createDiceSound: diceSounds.create,
    interactionClock,
    openTables: createOpenTablesStore({
      api: tableSessionApi,
      storage: tabStorage,
      createInteraction: tabInteractionFactory(boardCommands),
      wallClock: interactionClock.now,
    }),
    sessionStore: createSessionStore(),
    railStore: createRailStore(new StorageFake()),
    roomLayout: createRoomLayoutStore(roomLayoutStorage),
    drawingStyle: createDrawingStyleStore(drawingStyleStorage),
    effectAreaStyle: createEffectAreaStyleStore(effectAreaStyleStorage),
    wallStyle: createWallStyleStore(wallStyleStorage),
    lightReach: createLightReachStore(lightReachStorage),
    lightColor: createLightColorStore(lightColorStorage),
    auraMotion: createAuraMotionStore(auraMotionStorage),
    now: () => TEST_NOW,
    random: () => 0,
    publishedBuild,
    pageReloads,
    appUpdate: createAppUpdateStore({ running: TEST_BUILD, published: publishedBuild }),
    reloadPage: pageReloads.reload,
  };
}
