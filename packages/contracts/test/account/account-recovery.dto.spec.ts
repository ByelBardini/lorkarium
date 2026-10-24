import { describe, expect, it } from 'vitest';
import {
  accountRecoveryCheckResponseDto,
  accountRecoveryRequestDto,
} from '../../src/account/account-recovery.dto';

function issuesOf(input: unknown): { path: string; message: string }[] {
  const result = accountRecoveryRequestDto.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

describe('accountRecoveryRequestDto', () => {
  it('a trimmed token and a password of 8 are accepted', () => {
    expect(accountRecoveryRequestDto.parse({ token: ' t1 ', newPassword: '12345678' })).toEqual({
      token: 't1',
      newPassword: '12345678',
    });
  });

  it.each([[''], ['   '], ['a'.repeat(257)]])('token %j is refused', (token) => {
    expect(issuesOf({ token, newPassword: '12345678' }).map((issue) => issue.path)).toEqual([
      'token',
    ]);
  });

  it('a new password of 7 is refused citing the minimum', () => {
    expect(issuesOf({ token: 't1', newPassword: '1234567' })).toEqual([
      { path: 'newPassword', message: 'New password has 7 characters: expected at least 8.' },
    ]);
  });

  it('an extra field is refused (strict)', () => {
    const body = { token: 't1', newPassword: '12345678', userId: 'x' };
    expect(accountRecoveryRequestDto.safeParse(body).success).toBe(false);
  });
});

describe('accountRecoveryCheckResponseDto', () => {
  it('a kind outside the three is refused', () => {
    const body = { recovery: { kind: 'disable-two-factor', email: null } };
    expect(accountRecoveryCheckResponseDto.safeParse(body).success).toBe(false);
  });

  it('a revert with the masked address coming back is accepted', () => {
    const body = { recovery: { kind: 'revert-email-change', email: 'l****@x.com' } };
    expect(accountRecoveryCheckResponseDto.parse(body)).toEqual(body);
  });
});
