import type { AuthUserDto } from '@lorkarium/contracts';
import {
  redirect,
  useNavigate,
  useSearchParams,
  type MiddlewareFunction,
  type RouteObject,
} from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { LoginPage } from '@/features/auth/login-page';
import { campaignTableRoute } from '@/features/campaigns/campaign-routes';
import { homeRoutes } from '@/features/home/home-route';
import { useSignOutWhenRefused } from '@/features/sessions/use-sign-out-when-refused';
import { safeRedirectTarget } from '@/lib/safe-redirect';
import type { AuthApi } from '@/services/auth-api';
import type { CampaignsApi } from '@/services/campaigns-api';
import type { Clipboard } from '@/services/clipboard';
import type { OpenTablesStore } from '@/stores/open-tables-store';
import type { RailStore } from '@/stores/rail-store';
import { useSession, type SessionStore } from '@/stores/session-store';
import { decideAccess, type RouteAccess } from './route-access';
import { RouteErrorScreen } from './route-error-screen';
import { AppShell } from './shell/app-shell';
import { SplashScreen } from './splash-screen';

export type AppDependencies = Readonly<{
  authApi: AuthApi;
  campaignsApi: CampaignsApi;
  clipboard: Clipboard;
  openTables: StoreApi<OpenTablesStore>;
  sessionStore: StoreApi<SessionStore>;
  railStore: StoreApi<RailStore>;
  /** The instant of the overline date; a parameter so tests fix the day. */
  now: () => Date;
  /** A draw in [0, 1) for the greeting; `Math.random` in the app. */
  random: () => number;
}>;

/** Every route of the SPA, with the session resolved once at the root and a guard per route.
 *  Dependencies come in so tests can pass fakes and fresh stores.
 *
 *  Example: `createBrowserRouter(buildRoutes(dependencies))` */
export function buildRoutes(deps: AppDependencies): RouteObject[] {
  return [
    {
      id: 'root',
      middleware: [resolveSessionOnce(deps)],
      // The root middleware keeps the first navigation pending, so the splash covers the "who am I".
      HydrateFallback: SplashScreen,
      ErrorBoundary: RouteErrorScreen,
      children: [
        { path: 'login', middleware: [guard(deps, 'public-only')], Component: loginRoute(deps) },
        {
          path: 'admin',
          middleware: [guard(deps, 'admin')],
          lazy: async () => ({
            Component: (await import('@/features/admin/admin-page')).AdminPage,
          }),
        },
        {
          id: 'shell',
          middleware: [guard(deps, 'signed-in'), restoreOpenTables(deps)],
          Component: shellRoute(deps),
          children: [...homeRoutes(deps), campaignTableRoute(deps)],
        },
        { path: '*', loader: () => redirect('/') },
      ],
    },
  ];
}

function resolveSessionOnce({ authApi, sessionStore }: AppDependencies): MiddlewareFunction {
  return async () => {
    if (sessionStore.getState().session.status !== 'unknown') return;
    const result = await authApi.me();
    // Offline or a broken answer at boot: show the login, whose own submit reports the failure.
    if (result.ok && result.value) sessionStore.getState().signedIn(result.value);
    else sessionStore.getState().signedOut();
  };
}

function guard({ sessionStore }: AppDependencies, access: RouteAccess): MiddlewareFunction {
  return ({ request }) => {
    const session = sessionStore.getState().session;
    if (session.status === 'unknown') {
      throw new Error(
        `route guard "${access}" ran before the session was resolved (${request.url})`,
      );
    }
    const decision = decideAccess(session, access, new URL(request.url));
    if (decision.kind === 'redirect') throw redirect(decision.to);
  };
}

// In the middleware, not in an effect of the shell: a child's effects run before its parent's,
// so the table screen would open its own table before the tab's list came back.
function restoreOpenTables({ sessionStore, openTables }: AppDependencies): MiddlewareFunction {
  return () => {
    const session = sessionStore.getState().session;
    if (session.status === 'authenticated') openTables.getState().restore(session.user.id);
  };
}

function loginRoute({ authApi, sessionStore }: AppDependencies): () => React.JSX.Element {
  return function LoginRoute(): React.JSX.Element {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const enter = (user: AuthUserDto): void => {
      sessionStore.getState().signedIn(user);
      void navigate(safeRedirectTarget(searchParams.get('next')), { replace: true });
    };
    return <LoginPage authApi={authApi} onAuthenticated={enter} />;
  };
}

function shellRoute(deps: AppDependencies): () => React.JSX.Element | null {
  const { authApi, sessionStore, railStore, openTables } = deps;
  return function ShellRoute(): React.JSX.Element | null {
    const session = useSession(sessionStore);
    const navigate = useNavigate();
    useSignOutWhenRefused(openTables, sessionStore);
    if (session.status !== 'authenticated') return null;
    const signOut = async (): Promise<void> => {
      // Before the logout: once the session ends the server refuses the leaves, and the others
      // would only see these tables go after the grace period.
      openTables.getState().closeAll();
      await authApi.logout();
      sessionStore.getState().signedOut();
      await navigate('/login', { replace: true });
    };
    return (
      <AppShell
        railStore={railStore}
        openTables={openTables}
        user={session.user}
        onSignOut={signOut}
      />
    );
  };
}
