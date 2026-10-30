export interface AssetReadPolicyPort {
  canRead(userId: string, campaignId: string, assetId: string): Promise<boolean>;
}
