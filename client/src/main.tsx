import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { buildRoutes } from '@/app/router';
import { HttpAuthApi } from '@/services/auth-api';
import { HttpCampaignsApi } from '@/services/campaigns-api';
import { NavigatorClipboard } from '@/services/clipboard';
import { FetchHttpTransport } from '@/services/http-transport';
import { SocketIoRealtimeTransport } from '@/services/realtime-transport';
import { RealtimeTableSessionApi } from '@/services/table-session-api';
import { createRailStore } from '@/stores/rail-store';
import { sessionStore } from '@/stores/session-store';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('index.html must have a <div id="root"> for the app to mount');

// Reading `window.localStorage` itself throws when site data is blocked: defer it into the store's try.
const browserStorage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
};
const transport = new FetchHttpTransport();
const router = createBrowserRouter(
  buildRoutes({
    authApi: new HttpAuthApi(transport),
    campaignsApi: new HttpCampaignsApi(transport),
    clipboard: new NavigatorClipboard(),
    tableSessionApi: new RealtimeTableSessionApi(new SocketIoRealtimeTransport(), () =>
      crypto.randomUUID(),
    ),
    sessionStore,
    railStore: createRailStore(browserStorage),
    now: () => new Date(),
    random: Math.random,
  }),
);

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
