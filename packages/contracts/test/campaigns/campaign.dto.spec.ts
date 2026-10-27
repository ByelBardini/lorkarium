import { describe, expect, it } from 'vitest';
import {
  campaignMemberDto,
  campaignSummaryDto,
  contentWarningsDto,
} from '../../src/campaigns/campaign.dto';

const VHARN = '3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10';

const SUMMARY = {
  id: VHARN,
  name: 'Os Sinos de Vharn',
  system: null,
  status: 'recruiting',
  description: null,
  visibility: 'private',
  myRole: 'master',
  masterName: 'Ana',
  memberCount: 1,
  cover: { kind: 'drawn', drawing: 1, tone: 2 },
  contentWarnings: ['horror'],
  tags: ['sandbox'],
  playersCreateTokens: false,
  playersDeleteTokens: false,
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
});

describe('contentWarningsDto', () => {
  it('refuses a warning outside the fixed list', () => {
    expect(contentWarningsDto.safeParse(['spiders']).success).toBe(false);
  });
});

describe('campaignMemberDto', () => {
  const MEMBER = { userId: VHARN, name: 'Ana', role: 'master', color: 'gold', avatarId: null };

  it('requires online', () => {
    expect(campaignMemberDto.safeParse(MEMBER).success).toBe(false);
  });

  it('accepts a member with online', () => {
    expect(campaignMemberDto.parse({ ...MEMBER, online: false }).online).toBe(false);
  });
});
