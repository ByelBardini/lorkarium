import type { AccountSecurityDto, AccountSessionDto, ProfileDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { useLoaderData, type LoaderFunction, type RouteObject } from 'react-router';
import type { AppDependencies } from '@/app/router';
import { valueOrThrow } from '@/app/shell/api-loader';
import { accountAction } from './account-action';
import { AccountErrorScreen } from './account-error-screen';
import { AccountPage } from './account-page';
import { emailConfirmAction } from './email-confirm-action';
import { EmailConfirmPage } from './email-confirm-page';

export type AccountLoaderData = Readonly<{
  profile: ProfileDto;
  security: AccountSecurityDto;
  sessions: AccountSessionDto[];
}>;

/** "Minha conta" under the shell (`/account`): the profile, the security and the sessions in one
 *  load, and every command through one action.
 *
 *  Example: `{ id: 'shell', children: [...homeRoutes(deps), accountRoute(deps)] }` */
export function accountRoute(deps: AppDependencies): RouteObject {
  return {
    id: 'account',
    path: 'account',
    loader: accountLoader(deps),
    action: accountAction(deps),
    Component: accountScreen(deps),
    ErrorBoundary: accountErrorBoundary(deps),
  };
}

/** The page of the e-mail link (`/account/email/confirm#token=…`), outside the shell and open to
 *  anyone: the link may be opened in a browser that is not signed in.
 *
 *  Example: `{ path: 'account/email/confirm', middleware: [guard(deps, 'anyone')], ...emailConfirmRoute(deps) }` */
export function emailConfirmRoute(
  deps: AppDependencies,
): Pick<RouteObject, 'action' | 'Component'> {
  return {
    action: emailConfirmAction(deps),
    Component: function EmailConfirmRoute(): React.JSX.Element {
      return <EmailConfirmPage sessionStore={deps.sessionStore} />;
    },
  };
}

function accountLoader(deps: AppDependencies): LoaderFunction {
  const { profileApi, accountSecurityApi, sessionStore } = deps;
  return async ({ request }): Promise<AccountLoaderData> => {
    const [profile, security, sessions] = await Promise.all([
      profileApi.get(),
      accountSecurityApi.security(),
      accountSecurityApi.sessions(),
    ]);
    return {
      profile: valueOrThrow(profile, request, sessionStore),
      security: valueOrThrow(security, request, sessionStore),
      sessions: valueOrThrow(sessions, request, sessionStore),
    };
  };
}

function accountErrorBoundary({ sessionStore }: AppDependencies): () => React.JSX.Element | null {
  return function AccountErrorBoundary(): React.JSX.Element | null {
    return <AccountErrorScreen sessionStore={sessionStore} />;
  };
}

function accountScreen(deps: AppDependencies): () => React.JSX.Element {
  return function AccountRoute(): React.JSX.Element {
    const data = useLoaderData<AccountLoaderData>();
    // Fixed once per visit, like the home: the "há N" labels do not tick while the page is open.
    const [now] = useState(deps.now);
    return (
      <AccountPage
        {...data}
        now={now}
        profileApi={deps.profileApi}
        sessionStore={deps.sessionStore}
        clipboard={deps.clipboard}
      />
    );
  };
}
