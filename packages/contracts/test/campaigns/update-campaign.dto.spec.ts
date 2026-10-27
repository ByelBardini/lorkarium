import { describe, expect, it } from 'vitest';
import { updateCampaignRequestDto } from '../../src/campaigns/update-campaign.dto';

function issuePathsOf(input: unknown): string[] {
  const result = updateCampaignRequestDto.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join('.'));
}

describe('updateCampaignRequestDto', () => {
  it('refuses an empty body', () => {
    expect(updateCampaignRequestDto.safeParse({}).success).toBe(false);
  });

  it('accepts a body with only the name, trimmed', () => {
    expect(updateCampaignRequestDto.parse({ name: ' Vharn ' }).name).toBe('Vharn');
  });

  it('refuses a blank name on the name path', () => {
    expect(issuePathsOf({ name: '   ' })).toEqual(['name']);
  });

  it('keeps the password when it is absent', () => {
    expect(updateCampaignRequestDto.parse({ name: 'Vharn' }).password).toBeUndefined();
  });

  it('accepts password null, which removes it', () => {
    expect(updateCampaignRequestDto.parse({ password: null }).password).toBeNull();
  });

  it('accepts a new password of 4 characters', () => {
    expect(updateCampaignRequestDto.parse({ password: 'sino' }).password).toBe('sino');
  });

  it('refuses a new password of 3 characters on the password path', () => {
    expect(issuePathsOf({ password: 'abc' })).toEqual(['password']);
  });

  it('turns a blank system into null, which clears it', () => {
    expect(updateCampaignRequestDto.parse({ system: '  ' }).system).toBeNull();
  });

  it('leaves an absent system undefined, which keeps it', () => {
    expect(updateCampaignRequestDto.parse({ name: 'Vharn' }).system).toBeUndefined();
  });

  it('refuses a status outside the enum on the status path', () => {
    expect(issuePathsOf({ status: 'paused' })).toEqual(['status']);
  });

  it('normalizes repeated tags and repeated warnings', () => {
    const parsed = updateCampaignRequestDto.parse({
      tags: ['Horror', 'horror'],
      contentWarnings: ['gore', 'gore'],
    });
    expect(parsed.tags).toEqual(['Horror']);
    expect(parsed.contentWarnings).toEqual(['gore']);
  });

  it('accepts an image cover', () => {
    const cover = { kind: 'image', assetId: '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a' } as const;
    expect(updateCampaignRequestDto.parse({ cover }).cover).toEqual(cover);
  });

  it('refuses a forged campaignId key', () => {
    const result = updateCampaignRequestDto.safeParse({ name: 'Vharn', campaignId: 'x' });
    expect(result.success).toBe(false);
  });
});

describe('updateCampaignRequestDto token settings', () => {
  it('accepts only playersCreateTokens as the one field to change', () => {
    const body = updateCampaignRequestDto.parse({ playersCreateTokens: true });
    expect(body).toEqual({ playersCreateTokens: true });
  });

  it('accepts playersDeleteTokens false, which is not an empty body', () => {
    const body = updateCampaignRequestDto.parse({ playersDeleteTokens: false });
    expect(body.playersDeleteTokens).toBe(false);
  });

  it('refuses a non-boolean playersCreateTokens on its path', () => {
    expect(issuePathsOf({ playersCreateTokens: 'sim' })).toEqual(['playersCreateTokens']);
  });
});
