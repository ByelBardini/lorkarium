import { describe, expect, it } from 'vitest';
import { TwoFactorChallengeBo } from '../../../src/modules/auth/two-factor-challenge.bo';

const NOW = new Date('2026-10-14T12:00:00Z');

describe('TwoFactorChallengeBo', () => {
  it('a challenge started now expires 5 minutes later', () => {
    expect(TwoFactorChallengeBo.expiresAfter(NOW)).toEqual(new Date('2026-10-14T12:05:00Z'));
  });

  it('is alive one millisecond before the deadline', () => {
    const bo = new TwoFactorChallengeBo({ expiresAt: new Date(NOW.getTime() + 1), failures: 0 });
    expect(bo.isExpiredAt(NOW)).toBe(false);
  });

  it('is over at the deadline itself', () => {
    const bo = new TwoFactorChallengeBo({ expiresAt: NOW, failures: 0 });
    expect(bo.isExpiredAt(NOW)).toBe(true);
  });

  it.each([
    [4, false],
    [5, true],
    [6, true],
  ])('%i wrong codes exhausted: %s', (failures, exhausted) => {
    expect(TwoFactorChallengeBo.isExhausted(failures)).toBe(exhausted);
  });
});
