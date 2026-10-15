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
import { HomePage } from '@/features/home/home-page';
import { safeRedirectTarget } from '@/lib/safe-redirect';
import type { AuthApi } from '@/services/auth-api';
import { useSession, type SessionStore } from '@/stores/session-store';
import { decideAccess, type RouteAccess } from './route-access';
import { RouteErrorScreen } from './route-error-screen';
import { SplashScreen } from './splash-screen';

export type AppDependencies = Readonly<{
  authApi: AuthApi;
  sessionStore: StoreApi<SessionStore>;
}>;

/** Every route of the SPA, with the session resolved once at the root and a guard per route.
 *  Dependencies come in so tests can pass an `AuthApiFake` and a fresh store.
 *
 *  Example: `createBrowserRouter(buildRoutes({ authApi, sessionStore }))` */
export function buildRoutes(deps: AppDependencies): RouteObject[] {
  return [
    {
      id: 'root',
      middleware: [resolveSessionOnce(deps)],
      // The root middleware keeps the first navigation pending, so the splash covers the "who am I".
      HydrateFallback: SplashScreen,
      ErrorBoundary: RouteErrorScreen,
      children: [
        { index: true, middleware: [guard(deps, 'signed-in')], Component: homeRoute(deps) },
        { path: 'login', middleware: [guard(deps, 'public-only')], Component: loginRoute(deps) },
        {
          path: 'admin',
          middleware: [guard(deps, 'admin')],
          lazy: async () => ({
            Component: (await import('@/features/admin/admin-page')).AdminPage,
          }),
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

function homeRoute({ authApi, sessionStore }: AppDependencies): () => React.JSX.Element | null {
  return function HomeRoute(): React.JSX.Element | null {
    const session = useSession(sessionStore);
    const navigate = useNavigate();
    if (session.status !== 'authenticated') return null;
    const signOut = async (): Promise<void> => {
      await authApi.logout();
      sessionStore.getState().signedOut();
      await navigate('/login', { replace: true });
    };
    return <HomePage user={session.user} onSignOut={signOut} />;
  };
}
