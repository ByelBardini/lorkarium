import type { AuthUserDto } from '@lorkarium/contracts';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

/** `unknown` until the boot "who am I" answers; the server decides, this only mirrors it. */
export type SessionState =
  | Readonly<{ status: 'unknown' }>
  | Readonly<{ status: 'authenticated'; user: AuthUserDto }>
  | Readonly<{ status: 'anonymous' }>;

export type SessionStore = Readonly<{
  session: SessionState;
  signedIn: (user: AuthUserDto) => void;
  signedOut: () => void;
}>;

/** A fresh session store; the app uses the `sessionStore` singleton, tests build their own.
 *
 *  Example: `createSessionStore().getState().signedIn(user)` */
export function createSessionStore(): StoreApi<SessionStore> {
  return createStore<SessionStore>()((set) => ({
    session: { status: 'unknown' },
    signedIn: (user) => set({ session: { status: 'authenticated', user } }),
    signedOut: () => set({ session: { status: 'anonymous' } }),
  }));
}

export const sessionStore: StoreApi<SessionStore> = createSessionStore();

/** React view of the session (re-renders on change).
 *
 *  Example: `const session = useSession(sessionStore)` */
export function useSession(store: StoreApi<SessionStore>): SessionState {
  return useStore(store, (state) => state.session);
}
