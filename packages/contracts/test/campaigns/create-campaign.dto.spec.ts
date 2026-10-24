import { describe, expect, it } from 'vitest';
import { createCampaignRequestDto } from '../../src/campaigns/create-campaign.dto';

function issuePathsOf(input: unknown): string[] {
  const result = createCampaignRequestDto.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join('.'));
}

const VALID = { name: 'Os Sinos de Vharn', visibility: 'private' } as const;

describe('createCampaignRequestDto', () => {
  it('trims the name, turns absent optional texts into null and carries no password', () => {
    const parsed = createCampaignRequestDto.parse({
      name: '  Os Sinos de Vharn ',
      visibility: 'private',
    });
    expect(parsed).toEqual({
      name: 'Os Sinos de Vharn',
      system: null,
      status: 'building',
      description: null,
      visibility: 'private',
    });
    expect(parsed.password).toBeUndefined();
  });

  it('defaults the visibility to private when it is not sent', () => {
    expect(createCampaignRequestDto.parse({ name: 'Mesa' }).visibility).toBe('private');
  });

  it('accepts a name of exactly 80 characters', () => {
    expect(issuePathsOf({ ...VALID, name: 'a'.repeat(80) })).toEqual([]);
  });

  it('refuses a name of 81 characters on the name path', () => {
    expect(issuePathsOf({ ...VALID, name: 'a'.repeat(81) })).toEqual(['name']);
  });

  it('accepts a description of exactly 500 characters', () => {
    expect(issuePathsOf({ ...VALID, description: 'a'.repeat(500) })).toEqual([]);
  });

  it('refuses a description of 501 characters on the description path', () => {
    expect(issuePathsOf({ ...VALID, description: 'a'.repeat(501) })).toEqual(['description']);
  });

  it('refuses a system of 41 characters on the system path', () => {
    expect(issuePathsOf({ ...VALID, system: 'a'.repeat(41) })).toEqual(['system']);
  });

  it('turns a whitespace-only system into null', () => {
    expect(createCampaignRequestDto.parse({ ...VALID, system: '   ' }).system).toBeNull();
  });

  it('defaults the status to building when it is not sent', () => {
    expect(createCampaignRequestDto.parse(VALID).status).toBe('building');
  });

  it('refuses a status outside the enum on the status path', () => {
    expect(issuePathsOf({ ...VALID, status: 'Recrutando' })).toEqual(['status']);
  });

  it('accepts a drawn cover', () => {
    const cover = { kind: 'drawn', drawing: 2, tone: 4 } as const;
    expect(createCampaignRequestDto.parse({ ...VALID, cover }).cover).toEqual(cover);
  });

  it('refuses an image cover, which needs the campaign to exist first', () => {
    const cover = { kind: 'image', assetId: '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a' };
    expect(issuePathsOf({ ...VALID, cover })).toContain('cover.kind');
  });

  it('treats an empty password as absent', () => {
    expect(createCampaignRequestDto.parse({ ...VALID, password: '' }).password).toBeUndefined();
  });

  it('refuses a password of 3 characters on the password path', () => {
    expect(issuePathsOf({ ...VALID, password: 'abc' })).toEqual(['password']);
  });

  it('accepts a password of 4 characters', () => {
    expect(createCampaignRequestDto.parse({ ...VALID, password: 'abcd' }).password).toBe('abcd');
  });

  it('refuses a whitespace-only name on the name path', () => {
    expect(issuePathsOf({ ...VALID, name: '   ' })).toEqual(['name']);
  });

  it('refuses an unknown visibility on the visibility path', () => {
    expect(issuePathsOf({ ...VALID, visibility: 'secret' })).toEqual(['visibility']);
  });

  it('refuses a forged ownerId because the body is strict', () => {
    expect(createCampaignRequestDto.safeParse({ ...VALID, ownerId: 'x' }).success).toBe(false);
  });
});
