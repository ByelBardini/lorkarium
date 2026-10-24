const HOUR_MS = 60 * 60 * 1000;

export const PERSISTENT_SESSION_MS = 30 * 24 * HOUR_MS;
export const TRANSIENT_SESSION_MS = 12 * HOUR_MS;

export type AuthSessionTerms = Readonly<{ expiresAt: Date; persistent: boolean }>;

/** Deadline rules of a login session: fixed lifetime, sliding renewal past half of it.
 *
 *  Example: `new AuthSessionBo(row).renewalAt(clock.now()) // Date | null` */
export class AuthSessionBo {
  constructor(private readonly terms: AuthSessionTerms) {}

  static startedAt(now: Date, persistent: boolean): AuthSessionTerms {
    return { expiresAt: new Date(now.getTime() + lifetimeMs(persistent)), persistent };
  }

  isExpiredAt(now: Date): boolean {
    return now.getTime() >= this.terms.expiresAt.getTime();
  }

  /** When renewal becomes due (half of the lifetime left): until then a reread changes nothing.
   *
   *  Example: `new AuthSessionBo({ expiresAt, persistent: false }).recheckAt() // expiresAt − 6 h` */
  recheckAt(): Date {
    return new Date(this.terms.expiresAt.getTime() - lifetimeMs(this.terms.persistent) / 2);
  }

  /** The new deadline when less than half of the lifetime is left; `null` when renewal is not due. */
  renewalAt(now: Date): Date | null {
    const lifetime = lifetimeMs(this.terms.persistent);
    const remaining = this.terms.expiresAt.getTime() - now.getTime();
    if (remaining >= lifetime / 2) return null;
    return new Date(now.getTime() + lifetime);
  }
}

function lifetimeMs(persistent: boolean): number {
  return persistent ? PERSISTENT_SESSION_MS : TRANSIENT_SESSION_MS;
}
