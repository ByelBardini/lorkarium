import { describe, expect, it } from 'vitest';
import {
  campaignInfoDto,
  campaignMemberDto,
  campaignSummaryDto,
  contentWarningsDto,
} from '../../src/campaigns/campaign.dto';
import { publicCampaignDto } from '../../src/campaigns/public-campaign.dto';
import { PLAN_LIMITS } from '../../src/plans/plan-limits';

const VHARN = '3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10';

const SUMMARY = {
  id: VHARN,
  name: 'Os Sinos de Vharn',
  system: null,
  status: 'recruiting',
  description: null,
  visibility: 'private',
  myRole: 'master',
  juggernaut: false,
  ownerId: '9d0c1b2a-3e4f-4a5b-8c6d-7e8f9a0b1c2d',
  masterName: 'Ana',
  memberCount: 1,
  cover: { kind: 'drawn', drawing: 1, tone: 2 },
  photoAssetId: null,
  bannerAssetId: null,
  contentWarnings: ['horror'],
  tags: ['sandbox'],
  playersCreateTokens: false,
  playersDeleteTokens: false,
  limits: PLAN_LIMITS.free,
  lastEnteredAt: null,
} as const;

describe('campaignSummaryDto', () => {
  it('accepts a summary with status, cover, warnings and tags', () => {
    expect(campaignSummaryDto.parse(SUMMARY)).toEqual(SUMMARY);
  });

  it('refuses a free-text status, as the old rows had', () => {
    expect(campaignSummaryDto.safeParse({ ...SUMMARY, status: 'Recrutando' }).success).toBe(false);
  });

  it('refuses a null status: every campaign has one now', () => {
    expect(campaignSummaryDto.safeParse({ ...SUMMARY, status: null }).success).toBe(false);
  });

  it('refuses a summary without the owner id', () => {
    const withoutOwner = { ...SUMMARY, ownerId: undefined };
    expect(campaignSummaryDto.safeParse(withoutOwner).success).toBe(false);
  });

  it('refuses a summary that does not say whether the reader is a juggernaut', () => {
    const withoutMode = { ...SUMMARY, juggernaut: undefined };
    expect(campaignSummaryDto.safeParse(withoutMode).success).toBe(false);
  });
});

describe('contentWarningsDto', () => {
  it("carries the owner's limits and refuses a summary without them", () => {
    expect(campaignSummaryDto.parse(SUMMARY).limits.maxScenes).toBe(5);
    expect(campaignSummaryDto.safeParse({ ...SUMMARY, limits: undefined }).success).toBe(false);
  });

  it('refuses a warning outside the fixed list', () => {
    expect(contentWarningsDto.safeParse(['spiders']).success).toBe(false);
  });
});

describe('campaignMemberDto', () => {
  const MEMBER = {
    ...{ userId: VHARN, name: 'Ana', role: 'master', color: 'gold', avatarId: null },
    ...{ plan: 'lenda', admin: false, lorkariumOwner: false },
  } as const;

  it('requires online', () => {
    expect(campaignMemberDto.safeParse(MEMBER).success).toBe(false);
  });

  it('accepts a member with online', () => {
    expect(campaignMemberDto.parse({ ...MEMBER, online: false }).online).toBe(false);
  });

  it('carries the plan seals and refuses a plan outside the grid', () => {
    const member = { ...MEMBER, online: false };
    expect(campaignMemberDto.parse(member)).toMatchObject({ plan: 'lenda' });
    expect(campaignMemberDto.safeParse({ ...member, plan: 'pro' }).success).toBe(false);
  });

  it('carries whether the member is a global admin, and refuses a member that does not say', () => {
    const member = { ...MEMBER, online: false };
    expect(campaignMemberDto.parse({ ...member, admin: true }).admin).toBe(true);
    expect(campaignMemberDto.safeParse({ ...member, admin: undefined }).success).toBe(false);
    const withoutOwner = { ...member, lorkariumOwner: undefined };
    expect(campaignMemberDto.safeParse(withoutOwner).success).toBe(false);
  });
});

describe('campaignSummaryDto photo and banner', () => {
  const PHOTO = '7c2e4a1b-9d3f-4b6a-8e5c-2f1a0b9c8d7e';

  it('carries the photo id and a null banner', () => {
    const summary = { ...SUMMARY, photoAssetId: PHOTO, bannerAssetId: null };

    expect(campaignSummaryDto.parse(summary)).toEqual(summary);
  });

  it.each(['photoAssetId', 'bannerAssetId'])('refuses a %s that is not a uuid', (key) => {
    expect(campaignSummaryDto.safeParse({ ...SUMMARY, [key]: 'x' }).success).toBe(false);
  });

  it.each(['photoAssetId', 'bannerAssetId'])('refuses a summary without %s', (key) => {
    const without: Record<string, unknown> = { ...SUMMARY };
    delete without[key];

    expect(campaignSummaryDto.safeParse(without).success).toBe(false);
  });
});

describe('publicCampaignDto', () => {
  // The summary's info fields, without the limits nor what depends on the reader.
  const info = campaignInfoDto
    .omit({ limits: true })
    .parse(
      Object.fromEntries(
        Object.entries(SUMMARY).filter(([key]) => key in campaignInfoDto.shape && key !== 'limits'),
      ),
    );
  const CARD = {
    ...info,
    ...{ myRole: null, hasPassword: false, masterUsername: 'ana' },
    ...{ masterOnline: false, playersOnline: 0 },
  };

  it('carries the photo and the banner of the explore card', () => {
    const PHOTO = '7c2e4a1b-9d3f-4b6a-8e5c-2f1a0b9c8d7e';
    const card = { ...CARD, photoAssetId: PHOTO, bannerAssetId: null };

    expect(publicCampaignDto.parse(card)).toEqual(card);
  });

  it("leaves the owner's limits out of the explore card", () => {
    expect(publicCampaignDto.parse(CARD)).toEqual(CARD);
    expect(publicCampaignDto.safeParse({ ...CARD, limits: PLAN_LIMITS.free }).success).toBe(false);
  });
});
