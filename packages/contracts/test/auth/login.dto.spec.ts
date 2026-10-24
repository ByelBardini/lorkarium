import { describe, expect, it } from 'vitest';
import {
  loginRequestDto,
  loginResponseDto,
  twoFactorLoginRequestDto,
} from '../../src/auth/login.dto';

const ANA = {
  id: '7d0f8c39-2b8e-4f4e-9d1a-5c6b7a8e9f01',
  username: 'ana',
  name: 'Ana',
  email: 'ana@mesa.com',
  role: 'user',
  color: 'teal',
  avatarId: null,
} as const;

function issuePathsOf(input: unknown): string[] {
  const result = loginRequestDto.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join('.'));
}

describe('loginRequestDto', () => {
  it('trims and lowercases the e-mail and defaults rememberMe to false', () => {
    const parsed = loginRequestDto.parse({ email: '  Ana@Mesa.COM ', password: 'x' });
    expect(parsed).toEqual({ email: 'ana@mesa.com', password: 'x', rememberMe: false });
  });

  it('accepts a password of exactly 256 characters', () => {
    const result = loginRequestDto.safeParse({ email: 'ana@mesa.com', password: 'a'.repeat(256) });
    expect(result.success).toBe(true);
  });

  it('refuses a password of 257 characters on the password path', () => {
    expect(issuePathsOf({ email: 'ana@mesa.com', password: 'a'.repeat(257) })).toEqual([
      'password',
    ]);
  });

  it('refuses a forged role field because the body is strict', () => {
    const result = loginRequestDto.safeParse({
      email: 'ana@mesa.com',
      password: 'x',
      role: 'admin',
    });
    expect(result.success).toBe(false);
  });

  it('refuses a malformed e-mail on the email path', () => {
    expect(issuePathsOf({ email: 'ana', password: 'x' })).toEqual(['email']);
  });
});

describe('loginResponseDto', () => {
  it('a signed-in answer carries the user', () => {
    const answer = { status: 'signed-in', user: ANA };
    expect(loginResponseDto.parse(answer)).toEqual(answer);
  });

  it('a two-factor-required answer carries nothing else', () => {
    expect(loginResponseDto.parse({ status: 'two-factor-required' })).toEqual({
      status: 'two-factor-required',
    });
  });

  it('a two-factor-required answer with the user is refused (strict: no user before the code)', () => {
    const answer = { status: 'two-factor-required', user: ANA };
    expect(loginResponseDto.safeParse(answer).success).toBe(false);
  });

  it('the old shape without status is refused', () => {
    expect(loginResponseDto.safeParse({ user: ANA }).success).toBe(false);
  });
});

describe('twoFactorLoginRequestDto', () => {
  it('a 6-digit app code is accepted', () => {
    expect(twoFactorLoginRequestDto.parse({ code: '123456' })).toEqual({ code: '123456' });
  });

  it('a recovery code is accepted, normalized', () => {
    expect(twoFactorLoginRequestDto.parse({ recoveryCode: 'K7M2P-9QRST' })).toEqual({
      recoveryCode: 'k7m2p-9qrst',
    });
  });

  it('both a code and a recovery code are refused: exactly one must come', () => {
    const both = { code: '123456', recoveryCode: 'k7m2p-9qrst' };
    expect(twoFactorLoginRequestDto.safeParse(both).success).toBe(false);
  });

  it('neither a code nor a recovery code is refused', () => {
    expect(twoFactorLoginRequestDto.safeParse({}).success).toBe(false);
  });

  it('a code of 5 digits is refused', () => {
    expect(twoFactorLoginRequestDto.safeParse({ code: '12345' }).success).toBe(false);
  });
});
