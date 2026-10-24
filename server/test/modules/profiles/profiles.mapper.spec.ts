import { describe, expect, it } from 'vitest';
import {
  avatarKeyOf,
  toProfileChanges,
  toProfileDto,
} from '../../../src/modules/profiles/profiles.mapper';
import { profileRow } from '../../support/profiles-fakes';

describe('profiles mapper', () => {
  it('a chosen color is both the effective color and the choice', () => {
    expect(toProfileDto(profileRow({ color: 'rose' }))).toMatchObject({
      color: 'rose',
      colorChoice: 'rose',
    });
  });

  it('memberSince is the account creation date in ISO', () => {
    const row = profileRow({ createdAt: new Date('2026-10-05T08:30:00Z') });

    expect(toProfileDto(row).memberSince).toBe('2026-10-05T08:30:00.000Z');
  });

  it('only the fields that came become columns to write', () => {
    expect(toProfileChanges({ bio: null })).toEqual({ bio: null });
    expect(toProfileChanges({ name: 'Aninha', color: null })).toEqual({
      name: 'Aninha',
      color: null,
    });
  });

  it('a photo lives under avatars/<id>', () => {
    expect(avatarKeyOf('abc')).toBe('avatars/abc');
  });
});
