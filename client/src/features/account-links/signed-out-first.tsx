import { useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import type { SessionStore } from '@/stores/session-store';

export type SignedOutFirstProps = Readonly<{
  sessionStore: StoreApi<SessionStore>;
  /** Signs the current account out ("Sair e continuar"). */
  signOut: () => Promise<void>;
  /** The sentence for whoever is signed in, by their @. */
  notice: (username: string) => string;
  children: React.ReactNode;
}>;

/** The pages that create an account (`/invite`, `/sign-up`, `/sign-up/confirm`): signed in as
 *  someone, they ask to leave first ("Sair e continuar"), then show their content.
 *
 *  Example: `<SignedOutFirst sessionStore={s} signOut={out} notice={(at) => `Você está conectado como @${at}.`}>…</SignedOutFirst>` */
export function SignedOutFirst({
  sessionStore,
  signOut,
  notice,
  children,
}: SignedOutFirstProps): React.JSX.Element {
  // Who was signed in when the page opened: the acceptance signs the new account in before the
  // redirect, and reading the live session would unmount the form that owns the redirect.
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
      <p className="text-[15px]">{notice(signedInAs)}</p>
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
