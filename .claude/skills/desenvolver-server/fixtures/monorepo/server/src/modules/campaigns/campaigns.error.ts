export class NotCampaignOwnerError extends Error {
  constructor(
    readonly campaignId: string,
    readonly requesterId: string,
  ) {
    super(`user ${requesterId} does not own campaign ${campaignId}; only the owner (game master) can change it`);
  }
}
