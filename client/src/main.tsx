import { StrictMode } from 'react';
import { browserClock } from '@/lib/interaction-clock';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { PerfPanel } from '@/app/perf-panel';
import { tabInteractionFactory } from '@/features/board/tab-interaction';
import { buildRoutes } from '@/app/router';
import { NO_PERF_PROBE, RecordingPerfProbe } from '@/lib/perf-probe';
import { HttpAccountLinksApi } from '@/services/account-links-api';
import { HttpAccountSecurityApi } from '@/services/account-security-api';
import { HttpUserAdminApi } from '@/services/user-admin-api';
import { HttpAuthApi } from '@/services/auth-api';
import { HttpAssetsApi } from '@/services/assets-api';
import { HttpCampaignsApi } from '@/services/campaigns-api';
import { HttpLibraryApi } from '@/services/library-api';
import { HttpProfileApi } from '@/services/profile-api';
import { NavigatorClipboard } from '@/services/clipboard';
import { DocumentFieldEditing } from '@/services/field-editing';
import { isDesktopShell } from '@/lib/desktop-shell';
import { FetchHttpTransport } from '@/services/http-transport';
import { SocketIoRealtimeTransport } from '@/services/realtime-transport';
import { BoardCommandSender } from '@/services/board-command-sender';
import { RealtimeTableBoardCommands } from '@/services/table-board-commands';
import { RealtimePingCommands } from '@/services/table-pings';
import { RealtimeTableSessionApi } from '@/services/table-session-api';
import { RealtimeSceneActivation } from '@/services/scene-activation';
import { createOpenTablesStore } from '@/stores/open-tables-store';
import { createPixiBoardRenderer } from '@/renderer/pixi-board-renderer';
import { createRailStore } from '@/stores/rail-store';
import { createDrawingStyleStore } from '@/stores/drawing-style-store';
import { createEffectAreaStyleStore } from '@/stores/effect-area-style-store';
import { createWallStyleStore } from '@/stores/wall-style-store';
import { createLightColorStore } from '@/stores/light-color-store';
import { createAuraMotionStore } from '@/stores/aura-motion-store';
import { createLightReachStore } from '@/stores/light-reach-store';
import { createRoomLayoutStore } from '@/stores/room-layout-store';
import { sessionStore } from '@/stores/session-store';
import { createAppUpdateStore } from '@/stores/app-update-store';
import { buildFingerprintOf } from '@/lib/client-build';
import { FetchPublishedBuild } from '@/services/published-build';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('index.html must have a <div id="root"> for the app to mount');

// Reading `window.localStorage` / `sessionStorage` itself throws when site data is blocked: defer it into the store's try.
const browserStorage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
};
const tabStorage = {
  getItem: (key: string) => window.sessionStorage.getItem(key),
  setItem: (key: string, value: string) => window.sessionStorage.setItem(key, value),
  removeItem: (key: string) => window.sessionStorage.removeItem(key),
};
// The board's performance panel, only in dev with `?perf=1` (docs/context/client/performance.md).
const perfProbe =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get('perf') === '1'
    ? new RecordingPerfProbe()
    : null;
// One "Animar auras" for the toolbar and the board renderer.
const auraMotion = createAuraMotionStore(browserStorage);
const transport = new FetchHttpTransport();
const newActionId = (): string => crypto.randomUUID();
// One socket for every open table: the session, the board sync and the board commands.
const realtime = new SocketIoRealtimeTransport();
const tableSessionApi = new RealtimeTableSessionApi(realtime, newActionId);
const boardCommands = new RealtimeTableBoardCommands(realtime, newActionId);
// Read before any lazy route adds its own `/assets/` links to the document.
const appUpdate = createAppUpdateStore({
  running: buildFingerprintOf(document),
  published: new FetchPublishedBuild(window.fetch.bind(window)),
});
// A deploy restarts the server: the socket coming back is the first sign of a new build.
realtime.onLifecycle((change) => {
  if (change.kind === 'connected') void appUpdate.getState().check();
});
const router = createBrowserRouter(
  buildRoutes({
    authApi: new HttpAuthApi(transport),
    campaignsApi: new HttpCampaignsApi(transport),
    profileApi: new HttpProfileApi(transport),
    accountSecurityApi: new HttpAccountSecurityApi(transport),
    userAdminApi: new HttpUserAdminApi(transport),
    accountLinksApi: new HttpAccountLinksApi(transport),
    libraryApi: new HttpLibraryApi(transport),
    sceneActivation: new RealtimeSceneActivation(realtime, newActionId),
    assets: new HttpAssetsApi(transport),
    clipboard: new NavigatorClipboard(),
    isDesktop: isDesktopShell(navigator.userAgent),
    fieldEditing: new DocumentFieldEditing(document),
    openTables: createOpenTablesStore({
      api: tableSessionApi,
      storage: tabStorage,
      createInteraction: tabInteractionFactory(boardCommands),
    }),
    sessionStore,
    railStore: createRailStore(browserStorage),
    roomLayout: createRoomLayoutStore(browserStorage),
    drawingStyle: createDrawingStyleStore(browserStorage),
    effectAreaStyle: createEffectAreaStyleStore(browserStorage),
    wallStyle: createWallStyleStore(browserStorage),
    lightReach: createLightReachStore(browserStorage),
    lightColor: createLightColorStore(browserStorage),
    auraMotion,
    createBoardRenderer: (onIntent) =>
      createPixiBoardRenderer(
        onIntent,
        perfProbe ?? NO_PERF_PROBE,
        () => auraMotion.getState().animated,
      ),
    boardCommands,
    pings: new RealtimePingCommands(new BoardCommandSender(realtime, newActionId)),
    interactionClock: browserClock,
    now: () => new Date(),
    random: Math.random,
    waitBeforeRetry: (ms) => new Promise((resume) => setTimeout(resume, ms)),
    appUpdate,
    reloadPage: () => window.location.reload(),
  }),
);

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
    {perfProbe && <PerfPanel probe={perfProbe} />}
  </StrictMode>,
);
