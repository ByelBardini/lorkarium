import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { loginPathFor } from '@/app/route-access';
import type { SessionStore } from '@/stores/session-store';

/** An expired session ends the screen, as a loader's `redirectIfSignedOut` does: sign out locally
 *  and go to the login with `next` back to here. For the screens that learn of it after the
 *  loader (a dialog's own load, a fetcher's command); renders nothing.
 *
 *  Example: `if (failure.kind === 'unauthenticated') return <SignedOutRedirect sessionStore={sessionStore} />` */
export function SignedOutRedirect({
  sessionStore,
}: Readonly<{ sessionStore: StoreApi<SessionStore> }>): null {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  useEffect(() => {
    const here = new URL(`${pathname}${search}`, window.location.origin);
    sessionStore.getState().signedOut();
    void navigate(loginPathFor(here), { replace: true });
  }, [navigate, pathname, search, sessionStore]);
  return null;
}
