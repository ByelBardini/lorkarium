import type { AssetPurposeDto } from '@lorkarium/contracts';

// The purpose comes from the row the service already read: a policy that needs it never reads
// the asset again.
export interface AssetReadPolicyPort {
  canRead(
    userId: string,
    campaignId: string,
    assetId: string,
    purpose: AssetPurposeDto,
  ): Promise<boolean>;
}
