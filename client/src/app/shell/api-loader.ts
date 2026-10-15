import { redirect } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import type {
  CampaignsFailure,
  CampaignsFailureKind,
  CampaignsResult,
} from '@/services/campaigns-api';
import type { SessionStore } from '@/stores/session-store';
import { loginPathFor } from '../route-access';

/** A loader failure the route's ErrorBoundary turns into a message by `kind`. */
export class ApiLoadError extends Error {
  constructor(readonly kind: CampaignsFailureKind) {
    super(`the API answered ${kind} while loading the route`);
    this.name = 'ApiLoadError';
  }
}

/** The value of a loader call, or what the route does instead: a session that expired goes back to
 *  the login (with `next`), any other failure becomes an `ApiLoadError` for the ErrorBoundary.
 *
 *  Example: `return { campaigns: valueOrThrow(await campaignsApi.list(), request, sessionStore) }` */
export function valueOrThrow<T>(
  result: CampaignsResult<T>,
  request: Request,
  sessionStore: StoreApi<SessionStore>,
): T {
  if (result.ok) return result.value;
  redirectIfSignedOut(result.failure, request, sessionStore);
  throw new ApiLoadError(result.failure.kind);
}

/** An expired session ends the screen: sign out locally and go back to the login with `next`.
 *  Any other failure returns, for the caller to show.
 *
 *  Example: `if (!result.ok) redirectIfSignedOut(result.failure, request, sessionStore)` */
export function redirectIfSignedOut(
  failure: CampaignsFailure,
  request: Request,
  sessionStore: StoreApi<SessionStore>,
): void {
  if (failure.kind !== 'unauthenticated') return;
  sessionStore.getState().signedOut();
  throw redirect(loginPathFor(new URL(request.url)));
}
