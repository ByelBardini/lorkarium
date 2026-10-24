import { describe, expect, it } from 'vitest';
import { OtpauthTotp } from '../../../src/infrastructure/totp/otpauth-totp';

// RFC 6238 appendix B: the ASCII secret "12345678901234567890" (SHA-1), here in base32.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('OtpauthTotp', () => {
  const totp = new OtpauthTotp();

  it('at T = 59 s the RFC vector 94287082 (6 digits: 287082) matches step 1', () => {
    expect(totp.stepOf(RFC_SECRET, '287082', new Date(59_000))).toBe(1);
  });

  it('at T = 1111111109 s the RFC vector 07081804 (6 digits: 081804) matches step 37037036', () => {
    expect(totp.stepOf(RFC_SECRET, '081804', new Date(1_111_111_109_000))).toBe(37_037_036);
  });

  it('the code of the previous step still matches, naming that step', () => {
    expect(totp.stepOf(RFC_SECRET, '287082', new Date(89_000))).toBe(1);
  });

  it('a code two steps old matches nothing', () => {
    expect(totp.stepOf(RFC_SECRET, '287082', new Date(119_000))).toBeNull();
  });

  it('a wrong code matches nothing', () => {
    expect(totp.stepOf(RFC_SECRET, '000000', new Date(59_000))).toBeNull();
  });

  it('the current step counts 30 s periods since the epoch', () => {
    expect(totp.currentStep(new Date(59_000))).toBe(1);
    expect(totp.currentStep(new Date(60_000))).toBe(2);
  });

  it('the URI carries issuer=Lorkarium, the @ in the label and the secret', () => {
    const uri = totp.uri(RFC_SECRET, 'ana');
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain('issuer=Lorkarium');
    expect(uri).toContain('Lorkarium:ana');
    expect(uri).toContain(`secret=${RFC_SECRET}`);
  });

  it('a generated secret is base32 of 160 bits (32 characters) and differs each time', () => {
    const first = totp.generateSecret();
    expect(first).toMatch(/^[A-Z2-7]{32}$/);
    expect(totp.generateSecret()).not.toBe(first);
  });
});
