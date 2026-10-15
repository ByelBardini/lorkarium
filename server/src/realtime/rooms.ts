/** The Socket.IO room of one table; every presence and board event of it goes there.
 *
 *  Example: `io.to(campaignRoom(campaignId)).emit('session:memberLeft', event)` */
export function campaignRoom(campaignId: string): string {
  return `campaign:${campaignId}`;
}
