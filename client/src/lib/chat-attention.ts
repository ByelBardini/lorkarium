/** Where the person is: some window of the app in front (`focused`) and the table whose room is
 *  on screen (`null` = no room: the home, a table's settings, the account…). */
export type ChatAttentionView = Readonly<{ focused: boolean; roomCampaignId: string | null }>;

/** What the taskbar button must do now: `flash` (light up), `stop` (go dark) or nothing. */
export type TaskbarCommand = 'flash' | 'stop' | null;

/** The chat messages the person has not been where they could see: one pending mark per open
 *  table, set by a message from someone else that arrives while that table's room is not on screen
 *  with the app in front, and cleared only by being in that room with the app in front. While any
 *  is pending, the app leaving the front lights the button again (Windows will not flash the window
 *  in front, and puts out the flash when it comes back).
 *
 *  Example: `tracker.messageArrived('c1', { focused: false, roomCampaignId: 'c1' }) // 'flash'` */
export class ChatAttentionTracker {
  private readonly pending = new Set<string>();

  /** A message from someone else reached the table's chat (the viewer's own never comes here). */
  messageArrived(campaignId: string, view: ChatAttentionView): TaskbarCommand {
    if (view.focused && view.roomCampaignId === campaignId) return null;
    this.pending.add(campaignId);
    return view.focused ? null : 'flash';
  }

  /** The app came to the front or left it, or the room on screen changed. */
  viewChanged(view: ChatAttentionView): TaskbarCommand {
    if (!view.focused) return this.pending.size > 0 ? 'flash' : null;
    if (view.roomCampaignId === null || !this.pending.delete(view.roomCampaignId)) return null;
    return this.pending.size === 0 ? 'stop' : null;
  }

  /** Only these tables are still open: a closed one has nothing left to see. */
  keepOnly(openCampaignIds: ReadonlySet<string>): TaskbarCommand {
    if (this.pending.size === 0) return null;
    for (const campaignId of this.pending) {
      if (!openCampaignIds.has(campaignId)) this.pending.delete(campaignId);
    }
    return this.pending.size === 0 ? 'stop' : null;
  }
}
