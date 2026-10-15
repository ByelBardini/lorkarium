import { describe, expect, it } from 'vitest';
import { joinCampaignRequestDto } from '../../src/campaigns/join-campaign.dto';

function issuePathsOf(input: unknown): string[] {
  const result = joinCampaignRequestDto.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join('.'));
}

describe('joinCampaignRequestDto', () => {
  it('normalizes a lowercase hyphenated code with spaces around it', () => {
    expect(joinCampaignRequestDto.parse({ code: ' vhrn-7k2q ' })).toEqual({ code: 'VHRN7K2Q' });
  });

  it('removes inner spaces from the code and keeps the password', () => {
    expect(joinCampaignRequestDto.parse({ code: 'VHRN 7K2Q', password: 'x' })).toEqual({
      code: 'VHRN7K2Q',
      password: 'x',
    });
  });

  it('refuses a code of 7 characters on the code path', () => {
    expect(issuePathsOf({ code: 'VHRN7K2' })).toEqual(['code']);
  });

  it('refuses a code with the letter O, which is outside the alphabet', () => {
    expect(issuePathsOf({ code: 'VHRN7K2O' })).toEqual(['code']);
  });

  it('refuses a forged userId because the body is strict', () => {
    expect(joinCampaignRequestDto.safeParse({ code: 'VHRN7K2Q', userId: 'x' }).success).toBe(false);
  });
});
