import {
  PLAN_LIMITS,
  updateCampaignRequestDto,
  type UpdateCampaignRequestInput,
  type UserPlan,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  creationVisibilityOf,
  requireCampaignPlanFor,
  type CampaignPlanStored,
} from '../../../src/modules/campaigns/campaign-plan.bo';
import { PlanLimitError } from '../../../src/modules/plans/plans.error';

const STORED_COVER = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const STORED_BANNER = '6f5e4d3c-2b1a-4f0e-9d8c-7b6a5f4e3d2c';
const NEW_IMAGE = '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a';

const BARE: CampaignPlanStored = { coverAssetId: null, bannerAssetId: null, visibility: 'public' };
const GRANDFATHERED: CampaignPlanStored = {
  coverAssetId: STORED_COVER,
  bannerAssetId: STORED_BANNER,
  visibility: 'private',
};

function refusalOf(work: () => unknown): PlanLimitError | null {
  try {
    work();
  } catch (error) {
    if (error instanceof PlanLimitError) return error;
    throw error;
  }
  return null;
}

function gate(
  stored: CampaignPlanStored,
  body: UpdateCampaignRequestInput,
  plan: UserPlan = 'free',
) {
  const input = updateCampaignRequestDto.parse(body);
  return refusalOf(() => requireCampaignPlanFor(stored, input, PLAN_LIMITS[plan]));
}

describe('creationVisibilityOf', () => {
  it('a table created without a visibility is public on Grátis and Apoiador', () => {
    expect(creationVisibilityOf(undefined, PLAN_LIMITS.free)).toBe('public');
    expect(creationVisibilityOf(undefined, PLAN_LIMITS.apoiador)).toBe('public');
  });

  it('a table created without a visibility is private from Narrador up', () => {
    expect(creationVisibilityOf(undefined, PLAN_LIMITS.narrador)).toBe('private');
  });

  it('asking for private on Grátis is refused with privateCampaign', () => {
    const refusal = refusalOf(() => creationVisibilityOf('private', PLAN_LIMITS.free));
    expect(refusal).toMatchObject({ resource: 'privateCampaign', limit: 0, plan: 'free' });
  });

  it('asking for public passes on any plan, and private passes on Narrador', () => {
    expect(creationVisibilityOf('public', PLAN_LIMITS.free)).toBe('public');
    expect(creationVisibilityOf('private', PLAN_LIMITS.narrador)).toBe('private');
  });
});

describe('requireCampaignPlanFor', () => {
  it('a new cover image on Grátis is refused with campaignArt', () => {
    const refusal = gate(BARE, { cover: { kind: 'image', assetId: NEW_IMAGE } });
    expect(refusal).toMatchObject({ resource: 'campaignArt', plan: 'free' });
  });

  it('a new banner image on Apoiador is refused with campaignArt', () => {
    const refusal = gate(BARE, { bannerAssetId: NEW_IMAGE }, 'apoiador');
    expect(refusal).toMatchObject({ resource: 'campaignArt', plan: 'apoiador' });
  });

  it('turning a public table private on Grátis is refused with privateCampaign', () => {
    expect(gate(BARE, { visibility: 'private' })).toMatchObject({ resource: 'privateCampaign' });
  });

  it('keeping the cover, the banner and the privacy a table already has passes on Grátis', () => {
    const body = {
      cover: { kind: 'image', assetId: STORED_COVER },
      bannerAssetId: STORED_BANNER,
      visibility: 'private',
    } as const;
    expect(gate(GRANDFATHERED, body)).toBeNull();
  });

  it('removing the images, drawing the cover and going public pass on Grátis', () => {
    const body = {
      cover: { kind: 'drawn', drawing: 1, tone: 2 },
      bannerAssetId: null,
      visibility: 'public',
    } as const;
    expect(gate(GRANDFATHERED, body)).toBeNull();
  });

  it('a grandfathered banner does not open a new cover image', () => {
    const refusal = gate(GRANDFATHERED, { cover: { kind: 'image', assetId: NEW_IMAGE } });
    expect(refusal).toMatchObject({ resource: 'campaignArt' });
  });

  it('on Narrador new images and a private table pass', () => {
    const body = { bannerAssetId: NEW_IMAGE, visibility: 'private' } as const;
    expect(gate(BARE, body, 'narrador')).toBeNull();
  });
});
