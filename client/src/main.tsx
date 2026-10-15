import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { buildRoutes } from '@/app/router';
import { HttpAuthApi } from '@/services/auth-api';
import { FetchHttpTransport } from '@/services/http-transport';
import { sessionStore } from '@/stores/session-store';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('index.html must have a <div id="root"> for the app to mount');

const router = createBrowserRouter(
  buildRoutes({ authApi: new HttpAuthApi(new FetchHttpTransport()), sessionStore }),
);

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
