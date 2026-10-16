/** The Socket.IO room of one table; every presence and board event of it goes there.
 *
 *  Example: `io.to(campaignRoom(campaignId)).emit('session:memberLeft', event)` */
export function campaignRoom(campaignId: string): string {
  return `campaign:${campaignId}`;
}

/** One user's room inside a table: events only they (and the master) may see go here (§3.9).
 *
 *  Example: `io.to(campaignUserRoom(campaignId, controllerId)).emit('token:updated', full)` */
export function campaignUserRoom(campaignId: string, userId: string): string {
  return `${campaignRoom(campaignId)}:user:${userId}`;
}

/** The masters of a table: they always get the unredacted board.
 *
 *  Example: `io.to(campaignMastersRoom(campaignId)).emit('token:updated', full)` */
export function campaignMastersRoom(campaignId: string): string {
  return `${campaignRoom(campaignId)}:masters`;
}
