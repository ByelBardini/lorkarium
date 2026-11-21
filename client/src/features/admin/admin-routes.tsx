import {
  listFeedbackQueryDto,
  listUserReportsQueryDto,
  type FeedbackPageDto,
  type AdminBadgeDto,
  type AdminDirectoryResponseDto,
  type AdminUserDto,
  type MailBroadcastDto,
  type MailSampleDto,
  type UserReportsPageDto,
} from '@lorkarium/contracts';
import { useState } from 'react';
import { redirect, useLoaderData, type LoaderFunction, type RouteObject } from 'react-router';
import type { AppDependencies } from '@/app/router';
import { loginPathFor } from '@/app/route-access';
import { ApiLoadError } from '@/app/shell/api-loader';
import { ProfileCardProvider } from '@/features/profile-card/profile-card-provider';
import { ProfileCardTrigger } from '@/features/profile-card/profile-card-trigger';
import { skipSearchOnlyRevalidation } from '@/lib/search-only-revalidation';
import type { BadgesAdminFailure } from '@/services/badges-admin-api';
import { useSession } from '@/stores/session-store';
import { AdminErrorScreen } from './admin-error-screen';
import { AdminLayout } from './admin-layout';
import { BroadcastsPage } from './broadcasts-page';
import { badgesAction } from './badges-action';
import { feedbackAction } from './feedback-action';
import { FeedbackPage } from './feedback-page';
import { BadgesPage } from './badges-page';
import { mailTestAction } from './mail-test-action';
import { MailTestPage } from './mail-test-page';
import { ErrorTestPage } from './error-test-page';
import { reportsAction } from './reports-action';
import { ReportsPage } from './reports-page';
import { AdminForbiddenError, dropAdminRole, usersAction } from './users-action';
import { UsersPage } from './users-page';

export type UsersLoaderData = Readonly<{
  directory: AdminDirectoryResponseDto;
  twoFactorOn: boolean;
}>;

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
    shouldRevalidate: skipSearchOnlyRevalidation,
    action: usersAction(deps),
    Component: function UsersRoute(): React.JSX.Element {
      const { directory, twoFactorOn } = useLoaderData<UsersLoaderData>();
      // Fixed once per visit: the "há N" labels do not tick while the page is open.
      const [now] = useState(deps.now);
      const session = useSession(deps.sessionStore);
      const selfId = session.status === 'authenticated' ? session.user.id : null;
      return (
        <UsersPage
          directory={directory}
          now={now}
          selfId={selfId}
          clipboard={deps.clipboard}
          badgesApi={deps.badgesAdminApi}
          billingApi={deps.billingApi}
          sanctionsApi={deps.sanctionsApi}
          twoFactorOn={twoFactorOn}
        />
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

// Out of React and of the router: the error escapes the way a real bug of the page does.
const throwLater = (error: Error): void => {
  setTimeout(() => {
    throw error;
  });
};

/** "Teste de erros" (`/admin/erros`): a 500 of the server and an error of the browser, on purpose.
 *
 *  Example: `{ path: 'erros', lazy: async () => (await import('@/features/admin/admin-routes')).errorTestRoute(deps) }` */
export function errorTestRoute(deps: AppDependencies): Pick<RouteObject, 'Component'> {
  return {
    Component: function ErrorTestRoute(): React.JSX.Element {
      return <ErrorTestPage api={deps.errorReportsApi} scheduleThrow={throwLater} />;
    },
  };
}

export type BadgesLoaderData = Readonly<{ badges: AdminBadgeDto[] }>;

/** "Insígnias" (`/admin/badges`): the catalog in its order, the text commands through one action
 *  (the images go straight to the service).
 *
 *  Example: `{ path: 'badges', lazy: async () => (await import('@/features/admin/admin-routes')).badgesRoute(deps) }` */
export function badgesRoute(
  deps: AppDependencies,
): Pick<RouteObject, 'loader' | 'action' | 'Component' | 'ErrorBoundary'> {
  return {
    loader: async ({ request }): Promise<BadgesLoaderData> => {
      const result = await deps.badgesAdminApi.catalog();
      if (result.ok) return { badges: result.value };
      return refusedLoad(deps, result.failure.kind, request);
    },
    action: badgesAction(deps),
    Component: function BadgesRoute(): React.JSX.Element {
      const { badges } = useLoaderData<BadgesLoaderData>();
      return <BadgesPage badges={badges} api={deps.badgesAdminApi} />;
    },
    ErrorBoundary: function BadgesErrorBoundary(): React.JSX.Element | null {
      return (
        <AdminErrorScreen
          sessionStore={deps.sessionStore}
          pageTitle="Lorkarium · Insígnias"
          failedHeading="Não deu para carregar as insígnias."
        />
      );
    },
  };
}

export type BroadcastsLoaderData = Readonly<{
  broadcasts: MailBroadcastDto[];
  twoFactorOn: boolean;
}>;

/** "Comunicados" (`/admin/comunicados`): the service notices by e-mail and the editor; the
 *  commands go straight to the service (the preview, the test and the send are one flow).
 *
 *  Example: `{ path: 'comunicados', lazy: async () => (await import('@/features/admin/admin-routes')).broadcastsRoute(deps) }` */
export function broadcastsRoute(
  deps: AppDependencies,
): Pick<RouteObject, 'loader' | 'Component' | 'ErrorBoundary'> {
  return {
    loader: async ({ request }): Promise<BroadcastsLoaderData> => {
      const [result, security] = await Promise.all([
        deps.broadcastsApi.list(),
        deps.accountSecurityApi.security(),
      ]);
      // Unread, the button stays on: the server refuses the send without 2FA anyway.
      const twoFactorOn = !security.ok || security.value.twoFactor.enabled;
      if (result.ok) return { broadcasts: result.value, twoFactorOn };
      return refusedLoad(deps, loadRefusalOf(result.failure.kind), request);
    },
    Component: function BroadcastsRoute(): React.JSX.Element {
      const { broadcasts, twoFactorOn } = useLoaderData<BroadcastsLoaderData>();
      return (
        <BroadcastsPage
          broadcasts={broadcasts}
          api={deps.broadcastsApi}
          twoFactorOn={twoFactorOn}
        />
      );
    },
    ErrorBoundary: function BroadcastsErrorBoundary(): React.JSX.Element | null {
      return (
        <AdminErrorScreen
          sessionStore={deps.sessionStore}
          pageTitle="Lorkarium · Comunicados"
          failedHeading="Não deu para carregar os comunicados."
        />
      );
    },
  };
}

// Only the session and the role decide where a refused load goes; the rest is the error screen.
function loadRefusalOf(kind: string): BadgesAdminFailure['kind'] {
  if (kind === 'unauthenticated' || kind === 'forbidden' || kind === 'offline') return kind;
  return 'unexpected';
}

export type FeedbackLoaderData = Readonly<{ page: FeedbackPageDto }>;

/** "Relatos" (`/admin/relatos`): the bug reports and suggestions waiting (`?page`); publishing to
 *  GitHub and archiving go through one action.
 *
 *  Example: `{ path: 'relatos', lazy: async () => (await import('@/features/admin/admin-routes')).feedbackRoute(deps) }` */
export function feedbackRoute(
  deps: AppDependencies,
): Pick<RouteObject, 'loader' | 'action' | 'Component' | 'ErrorBoundary'> {
  return {
    loader: async ({ request }): Promise<FeedbackLoaderData> => {
      const raw = Object.fromEntries(new URL(request.url).searchParams);
      const query = listFeedbackQueryDto.safeParse(raw);
      const result = await deps.feedbackAdminApi.list(query.success ? query.data : { page: 1 });
      if (result.ok) return { page: result.value };
      return refusedLoad(deps, loadRefusalOf(result.failure.kind), request);
    },
    action: feedbackAction(deps),
    Component: function FeedbackRoute(): React.JSX.Element {
      return <FeedbackPage page={useLoaderData<FeedbackLoaderData>().page} />;
    },
    ErrorBoundary: function FeedbackErrorBoundary(): React.JSX.Element | null {
      return (
        <AdminErrorScreen
          sessionStore={deps.sessionStore}
          pageTitle="Lorkarium · Relatos"
          failedHeading="Não deu para carregar os relatos."
        />
      );
    },
  };
}

export type ReportsLoaderData = Readonly<{
  page: UserReportsPageDto;
  /** The accounts "Aplicar medida" finds the reported one in; empty when they did not load. */
  users: readonly AdminUserDto[];
  twoFactorOn: boolean;
}>;

/** "Denúncias" (`/admin/reports`): the reports queue (`?status&page`, the open ones by default);
 *  the reported @ opens that person's profile card, and a measure taken from a report goes
 *  through the same dialogs (and action) as Usuários.
 *
 *  Example: `{ path: 'reports', lazy: async () => (await import('@/features/admin/admin-routes')).reportsRoute(deps) }` */
export function reportsRoute(
  deps: AppDependencies,
): Pick<RouteObject, 'loader' | 'action' | 'Component' | 'ErrorBoundary'> {
  return {
    loader: reportsLoader(deps),
    action: reportsAction(deps),
    Component: function ReportsRoute(): React.JSX.Element | null {
      const { page, users, twoFactorOn } = useLoaderData<ReportsLoaderData>();
      const session = useSession(deps.sessionStore);
      if (session.status !== 'authenticated') return null;
      const { clipboard, badgesAdminApi: badgesApi, billingApi, sanctionsApi } = deps;
      const dialogs = { clipboard, badgesApi, billingApi, sanctionsApi, twoFactorOn };
      return (
        <ProfileCardProvider deps={deps} viewerId={session.user.id}>
          <ReportsPage
            page={page}
            measure={{ users, dialogs }}
            targetOf={(target) => (
              <ProfileCardTrigger userId={target.id} name={`@${target.username}`} />
            )}
          />
        </ProfileCardProvider>
      );
    },
    ErrorBoundary: function ReportsErrorBoundary(): React.JSX.Element | null {
      return (
        <AdminErrorScreen
          sessionStore={deps.sessionStore}
          pageTitle="Lorkarium · Denúncias"
          failedHeading="Não deu para carregar as denúncias."
        />
      );
    },
  };
}

// The queue decides the load; the accounts and the 2FA only light "Aplicar medida" and the
// cancel before a deletion, so their failure leaves the queue usable.
function reportsLoader(deps: AppDependencies): LoaderFunction {
  return async ({ request }): Promise<ReportsLoaderData> => {
    const [result, directory, security] = await Promise.all([
      deps.userReportsApi.list(reportsQueryOf(new URL(request.url))),
      deps.userAdminApi.directory(),
      deps.accountSecurityApi.security(),
    ]);
    if (!result.ok) return refusedLoad(deps, result.failure.kind, request);
    const users = directory.ok ? directory.value.users : [];
    const twoFactorOn = !security.ok || security.value.twoFactor.enabled;
    return { page: result.value, users, twoFactorOn };
  };
}

// A hand-edited query falls back to the first page of the open queue instead of failing the load.
function reportsQueryOf(url: URL): ReturnType<typeof listUserReportsQueryDto.parse> {
  const raw = Object.fromEntries(url.searchParams);
  const parsed = listUserReportsQueryDto.safeParse(raw);
  return parsed.success ? parsed.data : listUserReportsQueryDto.parse({});
}

function usersLoader(deps: AppDependencies): LoaderFunction {
  return async ({ request }): Promise<UsersLoaderData> => {
    const [result, security] = await Promise.all([
      deps.userAdminApi.directory(),
      deps.accountSecurityApi.security(),
    ]);
    // Unread, the button stays on: the billing service refuses without 2FA anyway.
    const twoFactorOn = !security.ok || security.value.twoFactor.enabled;
    if (result.ok) return { directory: result.value, twoFactorOn };
    return refusedLoad(deps, result.failure.kind, request);
  };
}

// A backoffice load refused: the login, "Sem acesso" or the error screen with "Tentar de novo".
function refusedLoad(
  { sessionStore }: AppDependencies,
  kind: BadgesAdminFailure['kind'],
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
