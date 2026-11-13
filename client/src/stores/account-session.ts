import type { AuthUserDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import type { Unsubscribe } from '@/services/realtime-transport';
import type { SessionStore } from './session-store';

/** What follows the account: `signedIn` once per account that enters (another account entering
 *  without a sign-out between runs `signedOut` first), `signedOut` once when it leaves. */
export type AccountSessionReactions = Readonly<{
  signedIn: (user: AuthUserDto) => void;
  signedOut: () => void;
}>;

/** Runs `reactions` on the transitions of the session, starting with the state it is in now
 *  (`unknown` waits for the boot answer). A new `/me` of the same account is not a transition.
 *
 *  Example: `followAccountSession(sessionStore, { signedIn: () => account.start(), signedOut: () => account.stop() })` */
export function followAccountSession(
  store: StoreApi<SessionStore>,
  reactions: AccountSessionReactions,
): Unsubscribe {
  let accountId: string | null = null;
  const follow = ({ session }: SessionStore): void => {
    const nextId = session.status === 'authenticated' ? session.user.id : null;
    if (session.status === 'unknown' || nextId === accountId) return;
    if (accountId !== null) reactions.signedOut();
    accountId = nextId;
    if (session.status === 'authenticated') reactions.signedIn(session.user);
  };
  follow(store.getState());
  return store.subscribe(follow);
}
