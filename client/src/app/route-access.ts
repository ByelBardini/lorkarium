import { safeRedirectTarget } from '@/lib/safe-redirect';
import type { SessionState } from '@/stores/session-store';

/** Who a route is for: only visitors (login), any signed-in account, admins, or anyone at all
 *  (a page reached from an e-mail link, signed in or not). */
export type RouteAccess = 'public-only' | 'signed-in' | 'admin' | 'anyone';

export type AccessDecision =
  Readonly<{ kind: 'allow' }> | Readonly<{ kind: 'redirect'; to: string }>;

/** A session the boot "who am I" already answered. */
export type KnownSession = Exclude<SessionState, { status: 'unknown' }>;

const ALLOW: AccessDecision = { kind: 'allow' };
const HOME = '/';

/** Where the client sends this session for this route. It only avoids showing the wrong screen:
 *  the server still refuses every request the session cannot make.
 *
 *  Example: `decideAccess(session, 'admin', new URL(request.url)) // { kind: 'redirect', to: '/' }` */
export function decideAccess(session: KnownSession, access: RouteAccess, url: URL): AccessDecision {
  if (access === 'anyone') return ALLOW;
  if (access === 'public-only') return decidePublicOnly(session, url);
  if (session.status === 'anonymous') return { kind: 'redirect', to: loginPathFor(url) };
  if (access === 'admin' && session.user.role !== 'admin') return { kind: 'redirect', to: HOME };
  return ALLOW;
}

function decidePublicOnly(session: KnownSession, url: URL): AccessDecision {
  if (session.status === 'anonymous') return ALLOW;
  return { kind: 'redirect', to: safeRedirectTarget(url.searchParams.get('next')) };
}

/** The login path that comes back to `url` after signing in.
 *
 *  Example: `loginPathFor(new URL(request.url)) // "/login?next=%2Fcampaigns"` */
export function loginPathFor(url: URL): string {
  return `/login?next=${encodeURIComponent(url.pathname + url.search)}`;
}
