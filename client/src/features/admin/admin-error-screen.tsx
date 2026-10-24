import { useRouteError } from 'react-router';
import { Link } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { LoadErrorScreen } from '@/components/load-error-screen';
import { SignedOutRedirect } from '@/components/signed-out-redirect';
import { buttonVariants } from '@/components/ui/button';
import type { SessionStore } from '@/stores/session-store';
import { AdminForbiddenError, AdminSignedOutError } from './users-action';

/** The users page when it could not load or a command found the session gone or the role taken:
 *  the login, "Você não tem mais acesso ao backoffice.", or "Tentar de novo".
 *
 *  Example: `ErrorBoundary: () => <AdminErrorScreen sessionStore={deps.sessionStore} />` */
export function AdminErrorScreen({
  sessionStore,
  pageTitle = 'Lorkarium · Usuários',
  failedHeading = 'Não deu para carregar os usuários.',
}: Readonly<{
  sessionStore: StoreApi<SessionStore>;
  pageTitle?: string;
  failedHeading?: string;
}>): React.JSX.Element | null {
  const error = useRouteError();
  if (error instanceof AdminSignedOutError)
    return <SignedOutRedirect sessionStore={sessionStore} />;
  if (error instanceof AdminForbiddenError) return <ForbiddenNotice />;
  return <LoadErrorScreen pageTitle={pageTitle} failedHeading={failedHeading} />;
}

function ForbiddenNotice(): React.JSX.Element {
  return (
    <div className="flex w-full flex-col items-start gap-4 px-4 py-16 sm:px-8 lg:px-12">
      <title>Lorkarium · Backoffice</title>
      <h1 className="font-display text-[32px] font-semibold">Sem acesso</h1>
      <p role="alert" className="text-muted-foreground">
        Você não tem mais acesso ao backoffice.
      </p>
      <Link to="/" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
        Voltar para o app
      </Link>
    </div>
  );
}
