import { Link, useFetcher } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import type {
  AccountLinksActionResult,
  AccountLinksIntent,
} from '@/features/account-links/account-links-action';
import { linkFailureMessage } from '@/features/account-links/account-links-messages';
import { InviteAcceptForm } from '@/features/account-links/invite-accept-form';
import { SignedOutFirst } from '@/features/account-links/signed-out-first';
import { AuthFrame } from '@/features/auth/auth-frame';
import { useFragmentToken } from '@/lib/use-fragment-token';
import { useOnceOnMount } from '@/lib/use-once-on-mount';
import type { SessionStore } from '@/stores/session-store';
import { SIGN_UP_LINK_DEAD, signedInToSignUp } from './sign-up-messages';

export type SignUpConfirmPageProps = Readonly<{
  sessionStore: StoreApi<SessionStore>;
  /** Signs the current account out ("Sair e continuar"). */
  signOut: () => Promise<void>;
}>;

/** The page of the sign-up link (`/sign-up/confirm#token=…`): the invitation form (the @, the
 *  password, the acceptance) for the address that asked; the account is born signed in.
 *
 *  Example: `<SignUpConfirmPage sessionStore={sessionStore} signOut={signOut} />` */
export function SignUpConfirmPage({
  sessionStore,
  signOut,
}: SignUpConfirmPageProps): React.JSX.Element {
  const token = useFragmentToken();
  const inspect = useFetcher<AccountLinksActionResult>();
  useOnceOnMount(() => {
    if (!token) return;
    const intent: AccountLinksIntent = { intent: 'inspect-invitation', token };
    void inspect.submit(intent, { method: 'post', encType: 'application/json' });
  });
  const result = inspect.state === 'idle' ? inspect.data : undefined;
  const invitation = result && 'invitation' in result ? result.invitation : null;
  const failure = result && 'failure' in result ? result.failure : null;
  return (
    // The acceptance box already links the legal texts: the foot would repeat them.
    <AuthFrame
      pageTitle="Lorkarium · Criar conta"
      heading="Crie sua conta"
      lead={invitation ? `Cadastro de ${invitation.email}` : undefined}
      legalLinks={false}
    >
      {!token || failure?.kind === 'link_invalid' ? (
        <DeadLink />
      ) : failure ? (
        <Alert variant="destructive" className="px-3.5 py-3 text-sm">
          {linkFailureMessage(failure)}
        </Alert>
      ) : !invitation ? (
        <p role="status" className="text-muted-foreground">
          Conferindo o link…
        </p>
      ) : (
        <SignedOutFirst sessionStore={sessionStore} signOut={signOut} notice={signedInToSignUp}>
          <InviteAcceptForm
            token={token}
            suggestedUsername={invitation.suggestedUsername}
            deadLink={<DeadLink />}
          />
        </SignedOutFirst>
      )}
    </AuthFrame>
  );
}

function DeadLink(): React.JSX.Element {
  return (
    <div className="flex flex-col items-start gap-4">
      <p className="text-[15px] text-muted-foreground">{SIGN_UP_LINK_DEAD}</p>
      <Link to="/sign-up" className={buttonVariants({ size: 'xl' })}>
        Pedir outro
      </Link>
    </div>
  );
}
