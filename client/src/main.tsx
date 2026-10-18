import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { buildRoutes } from '@/app/router';
import { HttpAuthApi } from '@/services/auth-api';
import { HttpAssetsApi } from '@/services/assets-api';
import { HttpCampaignsApi } from '@/services/campaigns-api';
import { NavigatorClipboard } from '@/services/clipboard';
import { FetchHttpTransport } from '@/services/http-transport';
import { SocketIoRealtimeTransport } from '@/services/realtime-transport';
import { RealtimeTableBoardCommands } from '@/services/table-board-commands';
import { RealtimeTableSessionApi } from '@/services/table-session-api';
import { createOpenTablesStore } from '@/stores/open-tables-store';
import { createPixiBoardRenderer } from '@/renderer/pixi-board-renderer';
import { createRailStore } from '@/stores/rail-store';
import { createDrawingStyleStore } from '@/stores/drawing-style-store';
import { createEffectAreaStyleStore } from '@/stores/effect-area-style-store';
import { createWallStyleStore } from '@/stores/wall-style-store';
import { createRoomLayoutStore } from '@/stores/room-layout-store';
import { sessionStore } from '@/stores/session-store';
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
const transport = new FetchHttpTransport();
const newActionId = (): string => crypto.randomUUID();
// One socket for every open table: the session, the board sync and the board commands.
const realtime = new SocketIoRealtimeTransport();
const tableSessionApi = new RealtimeTableSessionApi(realtime, newActionId);
const router = createBrowserRouter(
  buildRoutes({
    authApi: new HttpAuthApi(transport),
    campaignsApi: new HttpCampaignsApi(transport),
    assets: new HttpAssetsApi(transport),
    clipboard: new NavigatorClipboard(),
    openTables: createOpenTablesStore({ api: tableSessionApi, storage: tabStorage }),
    sessionStore,
    railStore: createRailStore(browserStorage),
    roomLayout: createRoomLayoutStore(browserStorage),
    drawingStyle: createDrawingStyleStore(browserStorage),
    effectAreaStyle: createEffectAreaStyleStore(browserStorage),
    wallStyle: createWallStyleStore(browserStorage),
    createBoardRenderer: createPixiBoardRenderer,
    boardCommands: new RealtimeTableBoardCommands(realtime, newActionId),
    now: () => new Date(),
    random: Math.random,
  }),
);

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
