import { Loader2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useFetcher, useLocation, useNavigate } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { BrandMark } from '@/components/brand-mark';
import { Alert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { useSession, type SessionStore } from '@/stores/session-store';
import { accountFailureMessage } from './account-messages';
import type { EmailConfirmResult } from './email-confirm-action';

const INVALID_LINK_MESSAGE = accountFailureMessage({ kind: 'email_token_invalid' });

/** The page of the confirmation link: reads the token from `#token=…` (never sent to the server
 *  as a URL), takes it off the address bar and confirms only on a click, because mail scanners
 *  open links by themselves.
 *
 *  Example: `<EmailConfirmPage sessionStore={sessionStore} />` */
export function EmailConfirmPage({
  sessionStore,
}: Readonly<{ sessionStore: StoreApi<SessionStore> }>): React.JSX.Element {
  const token = useTokenOfHash();
  const fetcher = useFetcher<EmailConfirmResult>();
  const settled = fetcher.state === 'idle' ? fetcher.data : undefined;
  const signedIn = useSession(sessionStore).status === 'authenticated';
  const failure = settled && 'failure' in settled ? settled.failure : null;
  const confirm = (): void => {
    if (token) void fetcher.submit({ token }, { method: 'post', encType: 'application/json' });
  };
  return (
    <main className="flex min-h-svh w-full flex-col items-start gap-8 bg-background px-4 py-12 sm:px-8 lg:px-12">
      <title>Lorkarium · Confirmar e-mail</title>
      <BrandMark variant="compact" />
      {settled && 'confirmed' in settled ? (
        <ConfirmedNotice signedIn={signedIn} />
      ) : !token || failure?.kind === 'email_token_invalid' ? (
        <ConfirmHeading text={INVALID_LINK_MESSAGE} />
      ) : (
        <div className="flex flex-col items-start gap-4">
          <ConfirmHeading text="Falta um clique para trocar seu e-mail." />
          {failure && (
            <Alert variant="destructive" className="px-3.5 py-3 text-sm">
              {accountFailureMessage(failure)}
            </Alert>
          )}
          <Button
            size="xl"
            disabled={fetcher.state !== 'idle'}
            aria-busy={fetcher.state !== 'idle'}
            onClick={confirm}
          >
            {fetcher.state !== 'idle' && (
              <Loader2Icon aria-hidden="true" className="animate-spin" />
            )}
            {fetcher.state !== 'idle' ? 'Confirmando…' : 'Confirmar novo e-mail'}
          </Button>
        </div>
      )}
    </main>
  );
}

// The token is kept in state and the hash is replaced away, so a reload or a shared screenshot
// does not carry it.
function useTokenOfHash(): string | null {
  const location = useLocation();
  const navigate = useNavigate();
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token'));
  useEffect(() => {
    if (location.hash)
      void navigate({ pathname: location.pathname, search: location.search }, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate]);
  return token?.trim() ? token : null;
}

function ConfirmHeading({ text }: Readonly<{ text: string }>): React.JSX.Element {
  return <h1 className="max-w-prose font-display text-[32px] font-semibold">{text}</h1>;
}

function ConfirmedNotice({ signedIn }: Readonly<{ signedIn: boolean }>): React.JSX.Element {
  return (
    <div className="flex flex-col items-start gap-4">
      <ConfirmHeading text="Pronto, seu e-mail foi trocado." />
      <p role="status" className="text-muted-foreground">
        {signedIn ? 'Sua conta já mostra o endereço novo.' : 'Entre com o endereço novo.'}
      </p>
      <Link to={signedIn ? '/' : '/login'} className={buttonVariants({ size: 'xl' })}>
        {signedIn ? 'Voltar para as mesas' : 'Entrar'}
      </Link>
    </div>
  );
}
