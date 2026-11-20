import type { AccountVisibilityPort } from '../modules/campaigns/account-visibility.port';

/** The campaigns are built before the realtime server, where the account presence lives: the
 *  presence is attached afterwards. Until then nobody shows online.
 *
 *  Example: `const visibility = new AccountVisibilityRelay(); …; visibility.attach(outlets.accountPresence)` */
export class AccountVisibilityRelay implements AccountVisibilityPort {
  private source: AccountVisibilityPort | null = null;

  attach(source: AccountVisibilityPort): void {
    this.source = source;
  }

  isVisiblyOnline(userId: string): boolean {
    return this.source?.isVisiblyOnline(userId) ?? false;
  }
}
