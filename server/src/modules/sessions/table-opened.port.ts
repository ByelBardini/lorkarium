/** One tab of an account at one table. */
export type TableVisit = Readonly<{ userId: string; campaignId: string; socketId: string }>;

/** What the account's presence hears from the live table session: which tables each tab of the
 *  person has open (friends see "Na mesa X" for a public one) and whether the tab stands still
 *  (the same `session:setActivity` feeds the account's away). Implemented by the account
 *  presence service; every call is fire-and-forget. */
export interface TableOpenedPort {
  tableOpened(visit: TableVisit): void;
  tableClosed(visit: TableVisit): void;
  /** The table is gone for the person on every tab (taken out of it, or the table deleted). */
  tableLeftEverywhere(userId: string, campaignId: string): void;
  activityChanged(userId: string, socketId: string, away: boolean): void;
}
