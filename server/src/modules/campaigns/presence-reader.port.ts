/** Who has a table open right now, read from the live session's presence in memory; the detail
 *  shows it as `online` on each member. Adapter in `src/infrastructure/presence-reader/`. */
export interface PresenceReaderPort {
  /** Empty for a table nobody is at. */
  onlineUserIdsOf(campaignId: string): ReadonlySet<string>;
}
