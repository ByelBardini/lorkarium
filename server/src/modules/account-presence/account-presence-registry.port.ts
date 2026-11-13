import type { AccountPresence } from './account-presence.bo';

/** Where each account's presence lives between commands. Synchronous on purpose: the service
 *  reads, decides and saves with no `await` in between, so two commands of one account never
 *  interleave. A shared store (Redis, several instances) needs an atomic update instead. */
export interface AccountPresenceRegistryPort {
  /** `undefined` for an account with no socket; the caller starts from `EMPTY_ACCOUNT_PRESENCE`. */
  presenceOf(userId: string): AccountPresence | undefined;
  save(userId: string, presence: AccountPresence): void;
}
