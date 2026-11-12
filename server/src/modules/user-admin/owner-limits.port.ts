/** Tells the live tables an owner's plan changed, after the commit, so each table they own hears
 *  its new limits (`session:campaignUpdated`); implemented by the campaigns module's
 *  `CampaignSettingsService`. */
export interface OwnerLimitsPort {
  ownerLimitsChanged(ownerId: string): Promise<void>;
}
