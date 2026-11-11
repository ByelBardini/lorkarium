/** Whether a raw socket payload names the table `campaignId`, read before any DTO: one socket
 *  carries every open table, so another table's event costs one field read and no parse.
 *
 *  Example: `if (!namesTable(payload, this.campaignId)) return;` */
export function namesTable(payload: unknown, campaignId: string): boolean {
  if (typeof payload !== 'object' || payload === null || !('campaignId' in payload)) return false;
  return payload.campaignId === campaignId;
}
