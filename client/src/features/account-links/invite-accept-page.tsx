import { useFetcher } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { Alert } from '@/components/ui/alert';
import { AuthFrame } from '@/features/auth/auth-frame';
import { useOnceOnMount } from '@/lib/use-once-on-mount';
import { useFragmentToken } from '@/lib/use-fragment-token';
import type { SessionStore } from '@/stores/session-store';
import type { AccountLinksActionResult, AccountLinksIntent } from './account-links-action';
import { INVITATION_LINK_DEAD, linkFailureMessage } from './account-links-messages';
import { InviteAcceptForm } from './invite-accept-form';
import { SignedOutFirst } from './signed-out-first';

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
        <SignedOutFirst sessionStore={sessionStore} signOut={signOut} notice={signedInNotice}>
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

function signedInNotice(username: string): string {
  return `Você está conectado como @${username}. Para aceitar este convite, saia primeiro.`;
}
