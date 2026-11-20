import type { ClockPort } from '../auth/clock.port';
import type { SessionTokenPort } from '../auth/session-token.port';
import { linkExpiry, PASSWORD_RESET_TTL_MS } from './account-link.bo';
import { linkOf } from './account-links.mapper';
import type { PasswordResetsDao } from './password-resets.dao';

export type PasswordLinksDeps = Readonly<{
  resets: Pick<PasswordResetsDao, 'replace'>;
  linkTokens: SessionTokenPort;
  clock: ClockPort;
  appPublicUrl: string;
}>;

export type IssuedPasswordLink = Readonly<{ link: string; expiresAt: Date }>;

/** Stores a new one-hour new-password link of an account (the previous one dies) and answers it.
 *  Shared by the admin's link, the forgotten password and the sign-up's "you already have one".
 *
 *  Example: `const { link } = await passwordLinks.issue(user.id)` */
export class PasswordLinksService {
  constructor(private readonly deps: PasswordLinksDeps) {}

  async issue(userId: string): Promise<IssuedPasswordLink> {
    const createdAt = this.deps.clock.now();
    const expiresAt = linkExpiry(createdAt, PASSWORD_RESET_TTL_MS);
    const token = this.deps.linkTokens.generate();
    const tokenHash = this.deps.linkTokens.hash(token);
    await this.deps.resets.replace({ userId, tokenHash, createdAt, expiresAt });
    return { link: linkOf(this.deps.appPublicUrl, '/reset-password', token), expiresAt };
  }
}
