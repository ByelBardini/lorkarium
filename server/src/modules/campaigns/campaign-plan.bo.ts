import type {
  CampaignVisibilityDto,
  PlanLimits,
  UpdateCampaignRequestDto,
} from '@lorkarium/contracts';
import { PlanLimitsBo } from '../plans/plan-limits.bo';
import type { CampaignPo } from './campaigns.po';

/** What of the stored table the plan gate compares against: what it already has stays
 *  (grandfathering), only what changes is checked. */
export type CampaignPlanStored = Pick<CampaignPo, 'coverAssetId' | 'bannerAssetId' | 'visibility'>;

/** The visibility a new table is created with: the one asked for, or private when the owner's
 *  plan has `privateCampaign` and public otherwise. Asking for private without it is refused
 *  (`PLAN_LIMIT`, `privateCampaign`).
 *
 *  Example: `creationVisibilityOf(undefined, PLAN_LIMITS.free) // 'public'` */
export function creationVisibilityOf(
  requested: CampaignVisibilityDto | undefined,
  limits: PlanLimits,
): CampaignVisibilityDto {
  if (requested === undefined) return limits.privateCampaign ? 'private' : 'public';
  if (requested === 'private') requirePrivateCampaign(limits);
  return requested;
}

/** Refuses (`PLAN_LIMIT`) a settings change the owner's plan lacks: a new cover or banner image
 *  without `campaignArt`, turning the table private without `privateCampaign`. Keeping what the
 *  table already has, removing an image or going public always pass.
 *
 *  Example: `requireCampaignPlanFor(stored, { bannerAssetId: newId }, PLAN_LIMITS.free) // throws` */
export function requireCampaignPlanFor(
  stored: CampaignPlanStored,
  input: UpdateCampaignRequestDto,
  limits: PlanLimits,
): void {
  if (setsNewCampaignArt(stored, input)) {
    PlanLimitsBo.requireFeature('campaignArt', limits.campaignArt, limits);
  }
  if (input.visibility === 'private' && stored.visibility !== 'private') {
    requirePrivateCampaign(limits);
  }
}

function setsNewCampaignArt(stored: CampaignPlanStored, input: UpdateCampaignRequestDto): boolean {
  const cover = input.cover?.kind === 'image' ? input.cover.assetId : null;
  if (cover !== null && cover !== stored.coverAssetId) return true;
  const banner = input.bannerAssetId ?? null;
  return banner !== null && banner !== stored.bannerAssetId;
}

function requirePrivateCampaign(limits: PlanLimits): void {
  PlanLimitsBo.requireFeature('privateCampaign', limits.privateCampaign, limits);
}
