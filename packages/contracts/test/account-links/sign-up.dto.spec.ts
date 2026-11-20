import { describe, expect, it } from 'vitest';
import { invitationInspectResponseDto } from '../../src/account-links/account-links.dto';
import {
  passwordResetRequestDto,
  signUpRequestDto,
  signUpSettingsDto,
} from '../../src/account-links/sign-up.dto';

function pathsOf(schema: { safeParse: (v: unknown) => unknown }, body: unknown): string[] {
  const result = schema.safeParse(body) as
    { success: true } | { success: false; error: { issues: { path: PropertyKey[] }[] } };
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('signUpRequestDto', () => {
  it('trims and lowercases the e-mail like the invitation', () => {
    const parsed = signUpRequestDto.parse({ email: ' Ana@Exemplo.COM ', humanCheckToken: 'tok' });
    expect(parsed).toEqual({ email: 'ana@exemplo.com', humanCheckToken: 'tok' });
  });

  it.each([
    [{ email: 'ana', humanCheckToken: 'tok' }, 'email'],
    [{ email: 'ana@exemplo.com', humanCheckToken: '' }, 'humanCheckToken'],
    [{ email: 'ana@exemplo.com' }, 'humanCheckToken'],
    [{ email: 'ana@exemplo.com', humanCheckToken: 'a'.repeat(2049) }, 'humanCheckToken'],
  ])('refuses %j at %s', (body, path) => {
    expect(pathsOf(signUpRequestDto, body)).toContain(path);
  });

  it('refuses an extra field (strict), such as a forged role', () => {
    const body = { email: 'ana@exemplo.com', humanCheckToken: 'tok', role: 'admin' };
    expect(signUpRequestDto.safeParse(body).success).toBe(false);
  });
});

describe('passwordResetRequestDto', () => {
  it.each([
    [' Ana@Exemplo.com ', 'ana@exemplo.com'],
    ['@Ana', 'ana'],
    ['ana', 'ana'],
  ])('takes the e-mail or the @ like the login: %j → %j', (identifier, expected) => {
    const parsed = passwordResetRequestDto.parse({ identifier, humanCheckToken: 'tok' });
    expect(parsed.identifier).toBe(expected);
  });

  it.each([
    [{ identifier: '', humanCheckToken: 'tok' }, 'identifier'],
    [{ identifier: 'ab', humanCheckToken: 'tok' }, 'identifier'],
    [{ identifier: 'ana', humanCheckToken: '' }, 'humanCheckToken'],
  ])('refuses %j at %s', (body, path) => {
    expect(pathsOf(passwordResetRequestDto, body)).toContain(path);
  });

  it('refuses an extra field', () => {
    const body = { identifier: 'ana', humanCheckToken: 'tok', password: 'x' };
    expect(passwordResetRequestDto.safeParse(body).success).toBe(false);
  });
});

describe('signUpSettingsDto', () => {
  it.each([
    { registrationOpen: true, humanCheckSiteKey: '0x4AAA' },
    { registrationOpen: false, humanCheckSiteKey: null },
  ])('accepts %j', (body) => {
    expect(signUpSettingsDto.parse(body)).toEqual(body);
  });

  it('refuses a missing site key field', () => {
    expect(pathsOf(signUpSettingsDto, { registrationOpen: true })).toContain('humanCheckSiteKey');
  });
});

describe('invitationInspectResponseDto origin', () => {
  const base = { email: 'ana@exemplo.com', suggestedUsername: 'ana' };

  it.each(['admin', 'self'])('accepts the origin %s', (origin) => {
    expect(invitationInspectResponseDto.parse({ ...base, origin }).origin).toBe(origin);
  });

  it('refuses an unknown origin and a missing one', () => {
    expect(pathsOf(invitationInspectResponseDto, { ...base, origin: 'friend' })).toContain(
      'origin',
    );
    expect(pathsOf(invitationInspectResponseDto, base)).toContain('origin');
  });
});
