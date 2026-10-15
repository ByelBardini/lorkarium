import { describe, expect, it } from 'vitest';
import { loginRequestDto } from '../../src/auth/login.dto';

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
