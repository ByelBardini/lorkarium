import { useRouteError } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { LoadErrorScreen } from '@/components/load-error-screen';
import { SignedOutRedirect } from '@/components/signed-out-redirect';
import type { SessionStore } from '@/stores/session-store';
import { AccountSignedOutError } from './account-action';

/** "Minha conta" when the account could not load: what happened and "Tentar de novo" (re-runs the
 *  loader). The shell stays around it. A command refused for a fallen session goes to the login.
 *
 *  Example: `ErrorBoundary: () => <AccountErrorScreen sessionStore={deps.sessionStore} />` */
export function AccountErrorScreen({
  sessionStore,
}: Readonly<{ sessionStore: StoreApi<SessionStore> }>): React.JSX.Element | null {
  const error = useRouteError();
  if (error instanceof AccountSignedOutError) {
    return <SignedOutRedirect sessionStore={sessionStore} />;
  }
  return (
    <LoadErrorScreen
      pageTitle="Lorkarium · Minha conta"
      failedHeading="Não deu para carregar sua conta."
    />
  );
}
