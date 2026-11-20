// A second click on "Criar conta" (or a script) must not flood the address with links.
export const SIGN_UP_RESEND_COOLDOWN_MS = 2 * 60 * 1000;

export type SignUpDecision = 'send-link' | 'renew-link' | 'tell-account-exists' | 'nothing';

/** An account a public form found: `resetIssuedAt` = its pending new-password link, the one a new
 *  e-mail would replace. */
export type FoundAccountFacts = Readonly<{ active: boolean; resetIssuedAt: Date | null }>;

/** What the server knows about the address asked for. */
export type SignUpFacts = Readonly<{
  account: FoundAccountFacts | null;
  banned: boolean;
  pending: Readonly<{ sentAt: Date }> | null;
  now: Date;
}>;

/** Within the cooldown of something sent at `at`?
 *
 *  Example: `sentWithinCooldown(oneMinuteAgo, now) // true` */
export function sentWithinCooldown(at: Date | null, now: Date): boolean {
  return at !== null && now.getTime() - at.getTime() < SIGN_UP_RESEND_COOLDOWN_MS;
}

/** May a public form (sign-up, forgotten password) mail this account a new-password link? Not a
 *  suspended one, and not twice within the cooldown.
 *
 *  Example: `mayMailPasswordLink({ active: true, resetIssuedAt: null }, now) // true` */
export function mayMailPasswordLink(account: FoundAccountFacts, now: Date): boolean {
  return account.active && !sentWithinCooldown(account.resetIssuedAt, now);
}

/** What a public sign-up request sends. The reply is the same whatever this decides: only the
 *  owner of the address learns, by e-mail, whether an account exists.
 *
 *  Example: `new SignUpBo({ account: null, banned: false, pending: null, now }).decide() // 'send-link'` */
export class SignUpBo {
  constructor(private readonly facts: SignUpFacts) {}

  decide(): SignUpDecision {
    const { account, banned, pending, now } = this.facts;
    if (account) return mayMailPasswordLink(account, now) ? 'tell-account-exists' : 'nothing';
    // Says nothing and gives no way back, unlike the admin's invitation (who may know).
    if (banned) return 'nothing';
    if (!pending) return 'send-link';
    return sentWithinCooldown(pending.sentAt, now) ? 'nothing' : 'renew-link';
  }
}
