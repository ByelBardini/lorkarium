import { AccountLinkInvalidError, LinkSelfActionError } from './account-links.error';

// The market: an invitation lasts days (Jira, 7), a new-password link an hour (OWASP, Ibexa).
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

/** When a link issued at `now` with `ttlMs` stops working.
 *
 *  Example: `linkExpiry(now, INVITATION_TTL_MS) // now + 7 days` */
export function linkExpiry(now: Date, ttlMs: number): Date {
  return new Date(now.getTime() + ttlMs);
}

export type AccountLinkFacts = Readonly<{ id: string; expiresAt: Date }>;

/** One invitation or new-password link: it works until its deadline, on every path that uses it
 *  (inspect, accept, complete; CVE-2023-48220 was a path that forgot it).
 *
 *  Example: `new AccountLinkBo(row).requireUsableAt(clock.now())` */
export class AccountLinkBo {
  constructor(private readonly facts: AccountLinkFacts) {}

  requireUsableAt(now: Date): void {
    if (now.getTime() < this.facts.expiresAt.getTime()) return;
    throw new AccountLinkInvalidError(
      `link ${this.facts.id} expired at ${this.facts.expiresAt.toISOString()} (now ${now.toISOString()})`,
    );
  }
}

/** An admin never sends a new-password link to their own account (they change it in Minha conta).
 *
 *  Example: `requireOtherAccount(admin.id, userId)` */
export function requireOtherAccount(actorId: string, targetId: string): void {
  if (actorId !== targetId) return;
  throw new LinkSelfActionError(actorId);
}
