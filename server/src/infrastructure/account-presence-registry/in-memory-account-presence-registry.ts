import type { AccountPresenceRegistryPort } from '../../modules/account-presence/account-presence-registry.port';
import {
  AccountPresenceBo,
  type AccountPresence,
} from '../../modules/account-presence/account-presence.bo';

/** Account presences in a `Map`: enough for the single instance of the MVP (spec §5.7).
 *
 *  Example: `registry.save(userId, outcome.state)` */
export class InMemoryAccountPresenceRegistry implements AccountPresenceRegistryPort {
  private readonly presences = new Map<string, AccountPresence>();

  presenceOf(userId: string): AccountPresence | undefined {
    return this.presences.get(userId);
  }

  // An account with no socket nor grace is dropped so offline accounts do not pile up; the
  // client sends its visibility again on every connection.
  save(userId: string, presence: AccountPresence): void {
    if (new AccountPresenceBo(presence).isEmpty()) this.presences.delete(userId);
    else this.presences.set(userId, presence);
  }

  accountCount(): number {
    return this.presences.size;
  }
}
