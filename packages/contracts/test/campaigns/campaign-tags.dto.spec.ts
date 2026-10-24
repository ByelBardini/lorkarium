import { describe, expect, it } from 'vitest';
import {
  campaignTagKey,
  campaignTagsDto,
  uniqueCampaignTags,
} from '../../src/campaigns/campaign-tags.dto';

function isRefused(input: unknown): boolean {
  return !campaignTagsDto.safeParse(input).success;
}

describe('campaignTagKey', () => {
  it('folds accent, case and outer spaces', () => {
    expect(campaignTagKey(' Mistério ')).toBe('misterio');
  });
});

describe('uniqueCampaignTags', () => {
  it('keeps the first spelling of a repeated tag and the order', () => {
    expect(uniqueCampaignTags(['Horror', 'sandbox', 'horror', 'Sandbox'])).toEqual([
      'Horror',
      'sandbox',
    ]);
  });
});

describe('campaignTagsDto', () => {
  it('trims each tag and drops repeats that differ by case or accent', () => {
    expect(campaignTagsDto.parse([' Mistério', 'misterio ', 'MISTÉRIO'])).toEqual(['Mistério']);
  });

  it('accepts 8 tags', () => {
    const tags = Array.from({ length: 8 }, (_, index) => `tag ${index}`);
    expect(campaignTagsDto.parse(tags)).toEqual(tags);
  });

  it('refuses a ninth distinct tag', () => {
    expect(isRefused(Array.from({ length: 9 }, (_, index) => `tag ${index}`))).toBe(true);
  });

  it('accepts nine tags when one repeats, since only 8 remain', () => {
    const tags = [...Array.from({ length: 8 }, (_, index) => `tag ${index}`), 'TAG 0'];
    expect(campaignTagsDto.parse(tags)).toHaveLength(8);
  });

  it('accepts a tag of 24 characters', () => {
    expect(isRefused(['a'.repeat(24)])).toBe(false);
  });

  it('refuses a tag of 25 characters', () => {
    expect(isRefused(['a'.repeat(25)])).toBe(true);
  });

  it('refuses a blank tag', () => {
    expect(isRefused(['   '])).toBe(true);
  });
});
