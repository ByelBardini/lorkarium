import { describe, expect, it } from 'vitest';
import { profileLookupParamsDto } from '../../src/profiles/profile-lookup.dto';

function usernameOf(typed: string): string {
  return profileLookupParamsDto.parse({ username: typed }).username;
}

describe('profileLookupParamsDto', () => {
  it('drops the leading "@" and lowercases', () => {
    expect(usernameOf('@Bia')).toBe('bia');
  });

  it('keeps the dot of an @ in lowercase', () => {
    expect(usernameOf('Bia.Rola')).toBe('bia.rola');
  });

  it('refuses an e-mail so the lookup never tests e-mails', () => {
    const result = profileLookupParamsDto.safeParse({ username: 'bia@exemplo.com' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('bia@exemplo.com');
  });

  it('refuses an @ shorter than the minimum', () => {
    const result = profileLookupParamsDto.safeParse({ username: 'b' });

    expect(result.error?.issues[0]?.message).toContain('too short');
  });

  it('refuses an extra param', () => {
    expect(profileLookupParamsDto.safeParse({ username: 'bia', userId: 'x' }).success).toBe(false);
  });
});
