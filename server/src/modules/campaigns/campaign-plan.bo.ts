import type {
  CampaignCoverDto,
  CampaignVisibilityDto,
  PlanLimits,
  UpdateCampaignRequestDto,
} from '@lorkarium/contracts';
import { CustomColorPlanBo } from '../plans/custom-color-plan.bo';
import { PlanLimitsBo } from '../plans/plan-limits.bo';
import type { CampaignPo } from './campaigns.po';

/** What of the stored table the plan gate compares against: what it already has stays
 *  (grandfathering), only what changes is checked. */
export type CampaignPlanStored = Pick<
  CampaignPo,
  'coverAssetId' | 'coverTone' | 'bannerAssetId' | 'visibility'
>;

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

/** Refuses (`PLAN_LIMIT` `customColor`) a new table whose drawn cover has a custom tone (`#rrggbb`)
 *  when the owner's plan lacks `customColor`; the tones of the palette pass on every plan.
 *
 *  Example: `requireCreationCoverTone({ kind: 'drawn', drawing: 0, tone: '#336699' }, PLAN_LIMITS.free) // throws` */
export function requireCreationCoverTone(
  cover: CampaignCoverDto | undefined,
  limits: PlanLimits,
): void {
  CustomColorPlanBo.requirePaletteUnlessAllowed(sentToneOf(cover), limits);
}

/** Refuses (`PLAN_LIMIT`) a settings change the owner's plan lacks: a new cover or banner image
 *  without `campaignArt`, turning the table private without `privateCampaign`, a custom cover tone
 *  the table does not hold without `customColor`. Keeping what the table already has, removing an
 *  image or going public always pass.
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
  CustomColorPlanBo.requirePaletteUnlessHeld([sentToneOf(input.cover)], [stored.coverTone], limits);
}

// The stored tone is text (`'3'` or `'#336699'`): a palette number never reads as a hex.
function sentToneOf(cover: CampaignCoverDto | undefined): string | undefined {
  return cover?.kind === 'drawn' ? String(cover.tone) : undefined;
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
