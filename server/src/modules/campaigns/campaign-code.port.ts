/** Source of fresh campaign join codes, in the canonical form of the contract. */
export interface CampaignCodePort {
  generate(): string;
}
