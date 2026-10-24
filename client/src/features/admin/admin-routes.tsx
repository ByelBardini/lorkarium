import type { AdminDirectoryResponseDto, MailSampleDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { redirect, useLoaderData, type LoaderFunction, type RouteObject } from 'react-router';
import type { AppDependencies } from '@/app/router';
import { loginPathFor } from '@/app/route-access';
import { ApiLoadError } from '@/app/shell/api-loader';
import type { UserAdminFailure } from '@/services/user-admin-api';
import { useSession } from '@/stores/session-store';
import { AdminErrorScreen } from './admin-error-screen';
import { AdminLayout } from './admin-layout';
import { mailTestAction } from './mail-test-action';
import { MailTestPage } from './mail-test-page';
import { AdminForbiddenError, dropAdminRole, usersAction } from './users-action';
import { UsersPage } from './users-page';

export type UsersLoaderData = Readonly<{ directory: AdminDirectoryResponseDto }>;

/** The backoffice frame (`/admin`), loaded lazily so players never download it; the server still
 *  guards every admin route with `requireRole('admin')`.
 *
 *  Example: `{ path: 'admin', lazy: async () => (await import('@/features/admin/admin-routes')).adminLayoutRoute(deps) }` */
export function adminLayoutRoute(deps: AppDependencies): Pick<RouteObject, 'Component'> {
  return {
    Component: function AdminLayoutRoute(): React.JSX.Element | null {
      const session = useSession(deps.sessionStore);
      if (session.status !== 'authenticated') return null;
      return <AdminLayout user={session.user} />;
    },
  };
}

/** "Usuários" (`/admin/users`): every account and invitation in one load, every command through
 *  one action.
 *
 *  Example: `{ path: 'users', lazy: async () => (await import('@/features/admin/admin-routes')).usersRoute(deps) }` */
export function usersRoute(
  deps: AppDependencies,
): Pick<RouteObject, 'loader' | 'action' | 'shouldRevalidate' | 'Component' | 'ErrorBoundary'> {
  return {
    loader: usersLoader(deps),
    // The search and the filters live in the URL and filter on the client: typing reloads nothing.
    shouldRevalidate: ({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }) => {
      const onlyFilters =
        !formMethod &&
        currentUrl.pathname === nextUrl.pathname &&
        currentUrl.search !== nextUrl.search;
      return onlyFilters ? false : defaultShouldRevalidate;
    },
    action: usersAction(deps),
    Component: function UsersRoute(): React.JSX.Element {
      const { directory } = useLoaderData<UsersLoaderData>();
      // Fixed once per visit: the "há N" labels do not tick while the page is open.
      const [now] = useState(deps.now);
      const session = useSession(deps.sessionStore);
      const selfId = session.status === 'authenticated' ? session.user.id : null;
      return (
        <UsersPage directory={directory} now={now} selfId={selfId} clipboard={deps.clipboard} />
      );
    },
    ErrorBoundary: function UsersErrorBoundary(): React.JSX.Element | null {
      return <AdminErrorScreen sessionStore={deps.sessionStore} />;
    },
  };
}

export type MailTestLoaderData = Readonly<{ samples: MailSampleDto[] }>;

/** "E-mails" (`/admin/emails`): a sample of every system e-mail, one button each.
 *
 *  Example: `{ path: 'emails', lazy: async () => (await import('@/features/admin/admin-routes')).mailTestRoute(deps) }` */
export function mailTestRoute(
  deps: AppDependencies,
): Pick<RouteObject, 'loader' | 'action' | 'Component' | 'ErrorBoundary'> {
  return {
    loader: async ({ request }): Promise<MailTestLoaderData> => {
      const result = await deps.userAdminApi.mailSamples();
      if (result.ok) return { samples: result.value };
      return refusedLoad(deps, result.failure.kind, request);
    },
    action: mailTestAction(deps),
    Component: function MailTestRoute(): React.JSX.Element {
      const { samples } = useLoaderData<MailTestLoaderData>();
      const session = useSession(deps.sessionStore);
      const defaultTo = session.status === 'authenticated' ? session.user.email : '';
      return <MailTestPage samples={samples} defaultTo={defaultTo} />;
    },
    ErrorBoundary: function MailTestErrorBoundary(): React.JSX.Element | null {
      return (
        <AdminErrorScreen
          sessionStore={deps.sessionStore}
          pageTitle="Lorkarium · E-mails"
          failedHeading="Não deu para carregar os e-mails do sistema."
        />
      );
    },
  };
}

function usersLoader(deps: AppDependencies): LoaderFunction {
  return async ({ request }): Promise<UsersLoaderData> => {
    const result = await deps.userAdminApi.directory();
    if (result.ok) return { directory: result.value };
    return refusedLoad(deps, result.failure.kind, request);
  };
}

// A backoffice load refused: the login, "Sem acesso" or the error screen with "Tentar de novo".
function refusedLoad(
  { sessionStore }: AppDependencies,
  kind: UserAdminFailure['kind'],
  request: Request,
): never {
  if (kind === 'unauthenticated') {
    sessionStore.getState().signedOut();
    throw redirect(loginPathFor(new URL(request.url)));
  }
  if (kind === 'forbidden') {
    dropAdminRole({ sessionStore });
    throw new AdminForbiddenError();
  }
  throw new ApiLoadError(kind === 'offline' ? 'offline' : 'unexpected');
}
