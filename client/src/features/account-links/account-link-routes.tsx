import type { RouteObject } from 'react-router';
import type { AppDependencies } from '@/app/router';
import { accountLinksAction } from './account-links-action';
import { InviteAcceptPage } from './invite-accept-page';
import { PasswordResetPage } from './password-reset-page';

/** The invitation page (`/invite#token=…`), outside the shell and open to anyone.
 *
 *  Example: `{ path: 'invite', middleware: [guard(deps, 'anyone')], ...inviteRoute(deps) }` */
export function inviteRoute(deps: AppDependencies): Pick<RouteObject, 'action' | 'Component'> {
  const { authApi, sessionStore, openTables } = deps;
  // Like the shell's "Sair": the tab's tables close before the session ends on the server.
  const signOut = async (): Promise<void> => {
    openTables.getState().closeAll();
    await authApi.logout();
    sessionStore.getState().signedOut();
  };
  return {
    action: accountLinksAction(deps),
    Component: function InviteRoute(): React.JSX.Element {
      return <InviteAcceptPage sessionStore={sessionStore} signOut={signOut} />;
    },
  };
}

/** The new-password page (`/reset-password#token=…`), outside the shell and open to anyone.
 *
 *  Example: `{ path: 'reset-password', middleware: [guard(deps, 'anyone')], ...passwordResetRoute(deps) }` */
export function passwordResetRoute(
  deps: AppDependencies,
): Pick<RouteObject, 'action' | 'Component'> {
  return { action: accountLinksAction(deps), Component: PasswordResetPage };
}
