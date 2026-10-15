import type { PresenceRegistryPort } from '../../modules/sessions/presence-registry.port';
import type { PresenceRoster } from '../../modules/sessions/table-presence.bo';

/** Rosters in a `Map`: enough for the single instance of the MVP (spec §5.5, §5.7).
 *
 *  Example: `registry.save(campaignId, outcome.roster)` */
export class InMemoryPresenceRegistry implements PresenceRegistryPort {
  private readonly rosters = new Map<string, PresenceRoster>();

  rosterOf(campaignId: string): PresenceRoster | undefined {
    return this.rosters.get(campaignId);
  }

  // An empty roster is dropped so tables nobody reopens do not pile up in memory.
  save(campaignId: string, roster: PresenceRoster): void {
    if (roster.sockets.size === 0 && roster.inGrace.size === 0) this.rosters.delete(campaignId);
    else this.rosters.set(campaignId, roster);
  }

  tableCount(): number {
    return this.rosters.size;
  }
}
