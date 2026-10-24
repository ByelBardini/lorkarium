import type { ProfileDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import type { SessionStore } from '@/stores/session-store';

/** The signed-in user takes the nickname, color and photo the server just confirmed, so the rail
 *  and the pings show them without another "who am I".
 *
 *  Example: `if (result.ok) applyProfileToSession(sessionStore, result.value)` */
export function applyProfileToSession(store: StoreApi<SessionStore>, profile: ProfileDto): void {
  const { session, signedIn } = store.getState();
  if (session.status !== 'authenticated' || session.user.id !== profile.id) return;
  const { name, color, avatarId } = profile;
  signedIn({ ...session.user, name, color, avatarId });
}
