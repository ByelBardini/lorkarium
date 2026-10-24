import type { CampaignInfoDto } from '@lorkarium/contracts';
import type { AssetsDao } from '../../src/modules/assets/assets.dao';
import type { AssetPo } from '../../src/modules/assets/assets.po';
import type { CachedMemberships } from '../../src/modules/campaigns/cached-memberships';
import type { CampaignChangedPort } from '../../src/modules/campaigns/campaign-changed.port';
import type { PresenceReaderPort } from '../../src/modules/campaigns/presence-reader.port';
import type { CampaignsDaoFake } from './campaigns-fakes';

/** Who is online, by campaign id; a table not listed has nobody.
 *
 *  Example: `new PresenceReaderFake({ [VHARN_ID]: [BIA_ID] })` */
export class PresenceReaderFake implements PresenceReaderPort {
  constructor(private readonly online: Readonly<Record<string, readonly string[]>> = {}) {}

  onlineUserIdsOf(campaignId: string): ReadonlySet<string> {
    return new Set(this.online[campaignId] ?? []);
  }
}

/** Records each change told to the live session, with the campaign writes already made when it
 *  was told (`writesBefore`), so a spec proves "persist, then publish".
 *
 *  Example: `changed.updated[0]?.writesBefore // ['update:<id>']` */
export class CampaignChangedFake implements CampaignChangedPort {
  readonly updated: Array<{ campaign: CampaignInfoDto; writesBefore: string[] }> = [];
  readonly deleted: Array<{ campaignId: string; writesBefore: string[] }> = [];

  constructor(private readonly campaigns: CampaignsDaoFake) {}

  campaignUpdated(campaign: CampaignInfoDto): void {
    this.updated.push({ campaign, writesBefore: [...this.campaigns.writes] });
  }

  async campaignDeleted(campaignId: string): Promise<void> {
    this.deleted.push({ campaignId, writesBefore: [...this.campaigns.writes] });
  }
}

/** The assets table as `findInCampaign` reads it: only an asset of the asked campaign is found. */
export class CampaignAssetsFake implements Pick<AssetsDao, 'findInCampaign'> {
  constructor(private readonly rows: readonly AssetPo[] = []) {}

  async findInCampaign(campaignId: string, assetId: string): Promise<AssetPo | undefined> {
    return this.rows.find((row) => row.campaignId === campaignId && row.id === assetId);
  }
}

/** Records each campaign the memberships memory was told to forget. */
export class ForgottenCampaignsFake implements Pick<CachedMemberships, 'forgetCampaign'> {
  readonly forgotten: string[] = [];

  forgetCampaign(campaignId: string): void {
    this.forgotten.push(campaignId);
  }
}
