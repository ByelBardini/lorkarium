import { describe, expect, it } from 'vitest';
import { TwoFactorBo } from '../../../src/modules/auth/two-factor.bo';

const USER_ID = 'user-ana';
const CURRENT_STEP = 1000;

function bo(lastStep: number | null = null, enabled = true): TwoFactorBo {
  return new TwoFactorBo({ userId: USER_ID, enabled, lastStep });
}

describe('TwoFactorBo.acceptTotp', () => {
  it.each([
    ['the current step', 1000],
    ['the step before', 999],
    ['the step after', 1001],
  ])('a code of %s is accepted and that step is the one to record', (_label, step) => {
    expect(bo().acceptTotp(step, CURRENT_STEP)).toBe(step);
  });

  it.each([
    ['two steps before', 998],
    ['two steps after', 1002],
  ])('a code of %s is refused as outside the window', (_label, step) => {
    expect(() => bo().acceptTotp(step, CURRENT_STEP)).toThrow(
      expect.objectContaining({
        code: 'TWO_FACTOR_CODE_INVALID',
        refusal: 'the code is outside the accepted window',
      }),
    );
  });

  it('a code that matched no step is refused with TWO_FACTOR_CODE_INVALID', () => {
    expect(() => bo().acceptTotp(null, CURRENT_STEP)).toThrow(
      expect.objectContaining({ code: 'TWO_FACTOR_CODE_INVALID', userId: USER_ID }),
    );
  });

  it('the step already accepted is refused as a replay', () => {
    expect(() => bo(1000).acceptTotp(1000, CURRENT_STEP)).toThrow(
      expect.objectContaining({ refusal: 'the code was already used' }),
    );
  });

  it('an older step than the last accepted is refused as a replay', () => {
    expect(() => bo(1000).acceptTotp(999, CURRENT_STEP)).toThrow(
      expect.objectContaining({ refusal: 'the code was already used' }),
    );
  });

  it('a step newer than the last accepted is accepted', () => {
    expect(bo(999).acceptTotp(1000, CURRENT_STEP)).toBe(1000);
  });

  it('the refusal message names the user and never the code', () => {
    expect(() => bo().acceptTotp(null, CURRENT_STEP)).toThrow(
      `second factor of user ${USER_ID} refused: no code matches the secret`,
    );
  });
});

describe('TwoFactorBo.acceptRecovery', () => {
  it('an unused code of the user is accepted', () => {
    expect(() => bo().acceptRecovery({ usedAt: null })).not.toThrow();
  });

  it('a code already used is refused', () => {
    expect(() => bo().acceptRecovery({ usedAt: new Date('2026-10-10T10:00:00Z') })).toThrow(
      expect.objectContaining({ refusal: 'the recovery code was already used' }),
    );
  });

  it('a code the user does not have is refused', () => {
    expect(() => bo().acceptRecovery(undefined)).toThrow(
      expect.objectContaining({ refusal: 'the recovery code is unknown' }),
    );
  });
});

describe('TwoFactorBo.requireEnabled', () => {
  it('2FA off (or only pending) is refused with TWO_FACTOR_CODE_INVALID', () => {
    expect(() => bo(null, false).requireEnabled()).toThrow(
      expect.objectContaining({ refusal: 'two-factor is not enabled' }),
    );
  });

  it('2FA on passes', () => {
    expect(() => bo(null, true).requireEnabled()).not.toThrow();
  });
});
