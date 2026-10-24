import { describe, expect, it } from 'vitest';
import {
  changeEmailRequestDto,
  changePasswordRequestDto,
} from '../../src/account/account-security.dto';

function passwordIssuesOf(input: unknown): { path: string; message: string }[] {
  const result = changePasswordRequestDto.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

describe('changePasswordRequestDto', () => {
  it('a new password of 7 characters is refused citing the minimum of 8', () => {
    expect(passwordIssuesOf({ currentPassword: 'velha', newPassword: '1234567' })).toEqual([
      { path: 'newPassword', message: 'New password has 7 characters: expected at least 8.' },
    ]);
  });

  it('a new password of 8 characters is accepted', () => {
    const body = { currentPassword: 'velha', newPassword: '12345678' };
    expect(changePasswordRequestDto.parse(body)).toEqual(body);
  });

  it('a new password of 256 characters is accepted and 257 are refused', () => {
    const ok = { currentPassword: 'velha', newPassword: 'a'.repeat(256) };
    expect(changePasswordRequestDto.safeParse(ok).success).toBe(true);
    expect(passwordIssuesOf({ currentPassword: 'velha', newPassword: 'a'.repeat(257) })).toEqual([
      { path: 'newPassword', message: 'New password has 257 characters: expected at most 256.' },
    ]);
  });

  it('a new password equal to the current one is not refused by the DTO', () => {
    const same = { currentPassword: 'mesma-senha', newPassword: 'mesma-senha' };
    expect(changePasswordRequestDto.safeParse(same).success).toBe(true);
  });

  it('an empty current password is refused on its path', () => {
    const body = { currentPassword: '', newPassword: '12345678' };
    expect(passwordIssuesOf(body).map(({ path }) => path)).toEqual(['currentPassword']);
  });
});

describe('changeEmailRequestDto', () => {
  it('the new e-mail is trimmed and lowercased before it is checked', () => {
    const body = changeEmailRequestDto.parse({ newEmail: ' Bia@X.com ', currentPassword: 'x' });
    expect(body.newEmail).toBe('bia@x.com');
  });

  it('a text that is not an e-mail is refused on the newEmail path', () => {
    const result = changeEmailRequestDto.safeParse({ newEmail: 'bia', currentPassword: 'x' });
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['newEmail']);
  });
});
