import { useState } from 'react';
import { useFetcher } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AuthFrame } from '@/features/auth/auth-frame';
import { useOnceOnMount } from '@/lib/use-once-on-mount';
import { useFragmentToken } from '@/lib/use-fragment-token';
import type { SessionStore } from '@/stores/session-store';
import type { AccountLinksActionResult, AccountLinksIntent } from './account-links-action';
import { INVITATION_LINK_DEAD, linkFailureMessage } from './account-links-messages';
import { InviteAcceptForm } from './invite-accept-form';

export type InviteAcceptPageProps = Readonly<{
  sessionStore: StoreApi<SessionStore>;
  /** Signs the current account out ("Sair e continuar"). */
  signOut: () => Promise<void>;
}>;

/** The page of the invitation link (`/invite#token=…`): for which address, the @ and the password,
 *  and the account is born signed in. Signed in as someone else, it asks to leave first.
 *
 *  Example: `<InviteAcceptPage sessionStore={sessionStore} signOut={signOut} />` */
export function InviteAcceptPage({
  sessionStore,
  signOut,
}: InviteAcceptPageProps): React.JSX.Element {
  const token = useFragmentToken();
  const inspect = useFetcher<AccountLinksActionResult>();
  useOnceOnMount(() => {
    if (!token) return;
    const intent: AccountLinksIntent = { intent: 'inspect-invitation', token };
    void inspect.submit(intent, { method: 'post', encType: 'application/json' });
  });
  const result = inspect.state === 'idle' ? inspect.data : undefined;
  const invitation = result && 'invitation' in result ? result.invitation : null;
  const dead = <p className="text-[15px] text-muted-foreground">{INVITATION_LINK_DEAD}</p>;
  const lead = invitation ? `Convite para ${invitation.email}` : undefined;
  return (
    // The acceptance box already links both texts: the foot would repeat them.
    <AuthFrame
      pageTitle="Lorkarium · Aceitar convite"
      heading="Bem-vindo ao Lorkarium"
      lead={lead}
      legalLinks={false}
    >
      {!token || (result && 'failure' in result && result.failure.kind === 'link_invalid') ? (
        dead
      ) : result && 'failure' in result ? (
        <Alert variant="destructive" className="px-3.5 py-3 text-sm">
          {linkFailureMessage(result.failure)}
        </Alert>
      ) : !invitation ? (
        <p role="status" className="text-muted-foreground">
          Conferindo o convite…
        </p>
      ) : (
        <SignedOutFirst sessionStore={sessionStore} signOut={signOut}>
          <InviteAcceptForm
            token={token}
            suggestedUsername={invitation.suggestedUsername}
            deadLink={dead}
          />
        </SignedOutFirst>
      )}
    </AuthFrame>
  );
}

// Who was signed in when the page opened: the acceptance signs the new account in before the
// redirect, and reading the live session would unmount the form that owns the redirect.
function SignedOutFirst({
  sessionStore,
  signOut,
  children,
}: Readonly<{
  sessionStore: StoreApi<SessionStore>;
  signOut: () => Promise<void>;
  children: React.ReactNode;
}>): React.JSX.Element {
  const [signedInAs] = useState(() => usernameOf(sessionStore));
  const [left, setLeft] = useState(false);
  const [leaving, setLeaving] = useState(false);
  if (!signedInAs || left) return <>{children}</>;
  const leave = async (): Promise<void> => {
    setLeaving(true);
    await signOut();
    setLeft(true);
  };
  return (
    <div className="flex flex-col items-start gap-4">
      <p className="text-[15px]">
        Você está conectado como @{signedInAs}. Para aceitar este convite, saia primeiro.
      </p>
      <Button size="xl" disabled={leaving} onClick={() => void leave()}>
        Sair e continuar
      </Button>
    </div>
  );
}

function usernameOf(sessionStore: StoreApi<SessionStore>): string | null {
  const { session } = sessionStore.getState();
  return session.status === 'authenticated' ? session.user.username : null;
}
