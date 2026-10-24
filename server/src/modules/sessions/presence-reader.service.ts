import type { PresenceRegistryPort } from './presence-registry.port';
import { TablePresenceBo } from './table-presence.bo';

const NOBODY: ReadonlySet<string> = new Set();

/** Who is online at a table, read from the live session's roster in memory with the session's
 *  own rule (`TablePresenceBo.onlineUserIds`). It is the campaigns module's `PresenceReaderPort`
 *  (structurally, like `TableSessionService` is its `CampaignChangedPort`); `buildApp` makes it over the registry the sessions module gets too,
 *  before both modules, so neither waits for the other.
 *
 *  Example: `new PresenceReaderService(registry).onlineUserIdsOf(campaignId).has(userId)` */
export class PresenceReaderService {
  constructor(private readonly registry: Pick<PresenceRegistryPort, 'rosterOf'>) {}

  onlineUserIdsOf(campaignId: string): ReadonlySet<string> {
    const roster = this.registry.rosterOf(campaignId);
    return roster ? new TablePresenceBo(roster).onlineUserIds() : NOBODY;
  }
}
