import type { CampaignDto } from '@fixture/contracts';
import { CampaignBo } from './campaign.bo';
import type { CampaignPo } from './campaigns.po';

/** PO → BO: the persisted row becomes the object that applies the rules.
 *
 *  Example: `toCampaignBo(row).renamedBy(ownerId, 'New name')` */
export function toCampaignBo(row: CampaignPo): CampaignBo {
  return new CampaignBo(row);
}

/** PO → DTO: what the client sees of a campaign.
 *
 *  Example: `toCampaignDto(row) // { id, name }` */
export function toCampaignDto(row: CampaignPo): CampaignDto {
  return { id: row.id, name: row.name };
}
