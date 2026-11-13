import { HttpImagePresentationApi } from '@/services/image-presentation-api';
import { ChatAttentionWatch } from '@/features/chat/chat-attention-watch';
import { TauriTaskbarAttention } from '@/services/taskbar-attention';
import { HttpLibraryMapsApi } from '@/services/library-maps-api';
import { HttpDocumentsApi } from '@/services/documents-api';
import { createDocumentWorkspaceStore } from '@/stores/document-workspace-store';
import { StrictMode } from 'react';
import { browserClock, browserWallClock } from '@/lib/interaction-clock';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { PerfPanel } from '@/app/perf-panel';
import { tabInteractionFactory } from '@/features/board/tab-interaction';
import { buildRoutes } from '@/app/router';
import { NO_PERF_PROBE, RecordingPerfProbe } from '@/lib/perf-probe';
import { HttpAccountLinksApi } from '@/services/account-links-api';
import { HttpAccountPlanApi } from '@/services/account-plan-api';
import { HttpAccountSecurityApi } from '@/services/account-security-api';
import { HttpUserAdminApi } from '@/services/user-admin-api';
import { HttpAuthApi } from '@/services/auth-api';
import { HttpAssetsApi } from '@/services/assets-api';
import { HttpCampaignsApi } from '@/services/campaigns-api';
import { HttpLibraryApi } from '@/services/library-api';
import { HttpProfileApi } from '@/services/profile-api';
import { HttpSavedColorsApi } from '@/services/saved-colors-api';
import { NavigatorClipboard } from '@/services/clipboard';
import { BrowserFileDownload } from '@/services/file-download';
import { DocumentFieldEditing } from '@/services/field-editing';
import { desktopShellOf, isDesktopShell } from '@/lib/desktop-shell';
import { TauriDesktopWindow } from '@/services/desktop-window';
import { FetchHttpTransport } from '@/services/http-transport';
import { SocketIoRealtimeTransport } from '@/services/realtime-transport';
import { BoardCommandSender } from '@/services/board-command-sender';
import { RealtimeTableBoardCommands } from '@/services/table-board-commands';
import { RealtimePingCommands } from '@/services/table-pings';
import { RealtimeChatCommands } from '@/services/chat-commands';
import { BrowserChatWindowHost } from '@/services/chat-window-host';
import { TauriChatWindowHost } from '@/services/desktop-chat-window-host';
import { RealtimeDiceCommands } from '@/services/dice-commands';
import { RealtimeSheetCommands } from '@/services/sheet-commands';
import { HttpSheetsApi, fetchAssetBytes } from '@/services/sheets-api';
import { HttpSheetTemplatesApi } from '@/services/sheet-templates-api';
import { storedSheetEditorLayout } from '@/lib/sheet-editor-layout';
import { chunkLoaderOf } from '@/lib/chunk-loader';
import { createWebAudioDiceSound } from '@/dice-audio/web-audio-dice-sound';
import { HttpSavedRollsApi } from '@/services/saved-rolls-api';
import { createDicePreferencesStore } from '@/stores/dice-preferences-store';
import { createChatPreferencesStore } from '@/stores/chat-preferences-store';
import { createWebAudioChatSound } from '@/chat-audio/web-audio-chat-sound';
import { RealtimeTableSessionApi } from '@/services/table-session-api';
import { RealtimeSceneActivation } from '@/services/scene-activation';
import { createOpenTablesStore } from '@/stores/open-tables-store';
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
import { linkAccount } from '@/app/account-link';
import { linkPresenceChoice } from '@/app/presence-link';
import { RealtimePresenceCommands } from '@/services/presence-commands';
import { createPresenceChoiceStore } from '@/stores/presence-choice-store';
import { AccountRealtime } from '@/services/account-realtime';
import { RealtimeDirectMessageCommands } from '@/services/direct-message-commands';
import { HttpFriendsApi } from '@/services/friends-api';
import { createDirectMessagesStore } from '@/stores/direct-messages-store';
import { createFriendsStore } from '@/stores/friends-store';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('index.html must have a <div id="root"> for the app to mount');

// Reading `window.localStorage` / `sessionStorage` itself throws when site data is blocked: defer it into the store's try.
const browserStorage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
  removeItem: (key: string) => window.localStorage.removeItem(key),
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
// Its own chunk: login and home never download PixiJS; the first board fetches it once.
const loadPixiBoard = chunkLoaderOf(() => import('@/renderer/pixi-board-renderer'));
const loadTextureCache = chunkLoaderOf(() => import('@/renderer/pixi-texture-cache'));
// The snapshot names the background before the renderer mounts: its download starts right away.
const prefetchBoardImage = (url: string): void =>
  void loadTextureCache().then(
    ({ PixiTextureCache }) => PixiTextureCache.prefetch(url),
    () => undefined,
  );
const transport = new FetchHttpTransport();
const imagePresentationApi = new HttpImagePresentationApi(transport);
const documentsApi = new HttpDocumentsApi(transport);
const sheetsApi = new HttpSheetsApi(transport, fetchAssetBytes());
const sheetTemplatesApi = new HttpSheetTemplatesApi(transport);
const libraryMapsApi = new HttpLibraryMapsApi(transport);
const documentWorkspace = createDocumentWorkspaceStore({
  api: documentsApi,
  sheetsApi,
  sheetTemplatesApi,
  mapsApi: libraryMapsApi,
  clock: browserClock,
});
const newActionId = (): string => crypto.randomUUID();
const signedInUserId = (): string | null => {
  const { session } = sessionStore.getState();
  return session.status === 'authenticated' ? session.user.id : null;
};
// One socket for the account (friends, direct messages) and every open table on it: the
// account connects it at sign-in and disconnects it at sign-out.
const realtime = new SocketIoRealtimeTransport();
const accountRealtime = new AccountRealtime(realtime, () => sessionStore.getState().signedOut());
const friendsApi = new HttpFriendsApi(transport);
const friends = createFriendsStore(friendsApi);
const directMessages = createDirectMessagesStore({
  commands: new RealtimeDirectMessageCommands(realtime, newActionId),
  storage: browserStorage,
  clock: browserWallClock,
});
linkAccount({ sessionStore, transport: realtime, accountRealtime, friends, directMessages });
const presenceChoice = createPresenceChoiceStore(browserStorage);
linkPresenceChoice(
  accountRealtime,
  presenceChoice,
  new RealtimePresenceCommands(realtime, newActionId),
);
const tableSessionApi = new RealtimeTableSessionApi(realtime, newActionId, prefetchBoardImage);
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
    savedColorsApi: new HttpSavedColorsApi(transport),
    accountSecurityApi: new HttpAccountSecurityApi(transport),
    accountPlanApi: new HttpAccountPlanApi(transport),
    userAdminApi: new HttpUserAdminApi(transport),
    accountLinksApi: new HttpAccountLinksApi(transport),
    libraryApi: new HttpLibraryApi(transport),
    libraryMapsApi,
    documentsApi,
    documentWorkspace,
    sheetsApi,
    sheetTemplatesApi,
    sheetEditorLayout: storedSheetEditorLayout(browserStorage, signedInUserId),
    sheetCommands: new RealtimeSheetCommands(realtime, newActionId),
    imagePresentationApi,
    sceneActivation: new RealtimeSceneActivation(realtime, newActionId),
    assets: new HttpAssetsApi(transport),
    clipboard: new NavigatorClipboard(),
    fileDownload: new BrowserFileDownload(),
    isDesktop: isDesktopShell(navigator.userAgent),
    desktopWindow: desktopShellOf(navigator.userAgent)?.titleBar ? new TauriDesktopWindow() : null,
    fieldEditing: new DocumentFieldEditing(document),
    openTables: createOpenTablesStore({
      api: tableSessionApi,
      imagePresentationApi,
      storage: tabStorage,
      createInteraction: tabInteractionFactory(boardCommands),
      wallClock: browserWallClock.now,
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
    createBoardRenderer: async (onIntent) =>
      (await loadPixiBoard()).createPixiBoardRenderer(
        onIntent,
        perfProbe ?? NO_PERF_PROBE,
        () => auraMotion.getState().animated,
      ),
    boardCommands,
    pings: new RealtimePingCommands(new BoardCommandSender(realtime, newActionId)),
    dice: new RealtimeDiceCommands(realtime, newActionId),
    chat: new RealtimeChatCommands(realtime, newActionId),
    chatWindowHost: isDesktopShell(navigator.userAgent)
      ? new TauriChatWindowHost(window)
      : new BrowserChatWindowHost(window),
    diceClock: browserWallClock,
    savedRolls: new HttpSavedRollsApi(transport),
    dicePreferences: createDicePreferencesStore(browserStorage),
    // Its own chunk: three.js is only fetched on the first roll with "Dados 3D" on.
    createDiceRenderer: () =>
      import('@/features/dice/app-dice-renderer').then((module) => module.createAppDiceRenderer()),
    createDiceSound: () => createWebAudioDiceSound(),
    chatPreferences: createChatPreferencesStore(browserStorage),
    createChatSound: () => createWebAudioChatSound(),
    chatAttention: desktopShellOf(navigator.userAgent)?.titleBar
      ? new ChatAttentionWatch(new TauriTaskbarAttention(), window)
      : null,
    interactionClock: browserClock,
    now: () => new Date(),
    random: Math.random,
    waitBeforeRetry: (ms) => new Promise((resume) => setTimeout(resume, ms)),
    appUpdate,
    reloadPage: () => window.location.reload(),
    accountRealtime,
    friendsApi,
    friends,
    directMessages,
    presenceChoice,
  }),
);

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
    {perfProbe && <PerfPanel probe={perfProbe} />}
  </StrictMode>,
);
