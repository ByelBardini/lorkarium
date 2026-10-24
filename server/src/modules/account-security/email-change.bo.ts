import { EmailTokenInvalidError, EmailUnchangedError } from './account-security.error';

/** How long the confirmation link of an e-mail change lives. */
export const EMAIL_CHANGE_MS = 30 * 60 * 1000;

export type EmailChangeState = Readonly<{ userId: string; currentEmail: string }>;

/** The ask for a new e-mail: never the current one, valid for 30 minutes.
 *
 *  Example: `new EmailChangeBo({ userId, currentEmail }).requestAt('bia@novo.com', now) // now + 30 min` */
export class EmailChangeBo {
  constructor(private readonly state: EmailChangeState) {}

  /** The deadline of the link for `newEmail` asked at `now`; refuses the current address. */
  requestAt(newEmail: string, now: Date): Date {
    if (newEmail === this.state.currentEmail) throw new EmailUnchangedError(this.state.userId);
    return new Date(now.getTime() + EMAIL_CHANGE_MS);
  }
}

/** A pending change, alive until its deadline (`now ≥ expiresAt` is over).
 *
 *  Example: `new PendingEmailBo({ expiresAt }).requireLiveAt(clock.now())` */
export class PendingEmailBo {
  constructor(private readonly state: Readonly<{ expiresAt: Date }>) {}

  isExpiredAt(now: Date): boolean {
    return now.getTime() >= this.state.expiresAt.getTime();
  }

  requireLiveAt(now: Date): void {
    if (this.isExpiredAt(now)) throw new EmailTokenInvalidError('an expired token');
  }
}

/** The address with the local part hidden but its first letter: shown while the change waits.
 *
 *  Example: `maskEmail('bianca@x.com') // 'b*****@x.com'` */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '*'.repeat(email.length);
  const local = email.slice(0, at);
  return `${local.charAt(0)}${'*'.repeat(local.length - 1)}${email.slice(at)}`;
}
