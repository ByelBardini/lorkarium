import type { PresenceRoster } from './table-presence.bo';

/** Where each table's roster lives between commands. Synchronous on purpose: the service reads,
 *  decides and saves with no `await` in between, so two commands on one table never interleave.
 *  A shared store (Redis, several instances) needs an atomic update instead of this pair. */
export interface PresenceRegistryPort {
  /** `undefined` for a table nobody is at; the caller starts from `EMPTY_ROSTER`. */
  rosterOf(campaignId: string): PresenceRoster | undefined;
  save(campaignId: string, roster: PresenceRoster): void;
}
