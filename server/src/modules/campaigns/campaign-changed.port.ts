import type { CampaignInfoDto } from '@lorkarium/contracts';

/** Told after a campaign change was saved, so whoever has the table open hears it; implemented
 *  by the live session service (`session:campaignUpdated`, `session:campaignDeleted`). */
export interface CampaignChangedPort {
  /** The settings or the join code were saved; `campaign` is read again after the write. */
  campaignUpdated(campaign: CampaignInfoDto): void;
  /** The campaign is gone: its room hears it and is emptied. */
  campaignDeleted(campaignId: string): Promise<void>;
}
