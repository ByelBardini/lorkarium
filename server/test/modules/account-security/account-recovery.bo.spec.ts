import { describe, expect, it } from 'vitest';
import {
  AccountRecoveryBo,
  recoveryExpiry,
  type RecoveryFacts,
} from '../../../src/modules/account-security/account-recovery.bo';

const EXPIRES_AT = new Date('2026-10-31T12:00:00Z');

function facts(overrides: Partial<RecoveryFacts> = {}): RecoveryFacts {
  return {
    id: 'sha:t1',
    kind: 'revert-password-change',
    hasEmail: false,
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

describe('recoveryExpiry', () => {
  it('a link issued now lives 7 days', () => {
    expect(recoveryExpiry(new Date('2026-10-24T12:00:00Z'))).toEqual(EXPIRES_AT);
  });
});

describe('AccountRecoveryBo', () => {
  it('one millisecond before the end the link still works', () => {
    const bo = new AccountRecoveryBo(facts());
    expect(() => bo.requireUsable(new Date(EXPIRES_AT.getTime() - 1))).not.toThrow();
  });

  it('at the end it is RECOVERY_TOKEN_INVALID citing the expiry and now', () => {
    const bo = new AccountRecoveryBo(facts());
    expect(() => bo.requireUsable(EXPIRES_AT)).toThrow(
      expect.objectContaining({
        code: 'RECOVERY_TOKEN_INVALID',
        message: expect.stringContaining('2026-10-31T12:00:00.000Z (now 2026-10-31T12:00:00.000Z)'),
      }),
    );
  });

  it.each([
    ['revert-email-change', true, true],
    ['cancel-email-change', false, false],
    ['revert-password-change', false, false],
  ] as const)('%s restores the e-mail: %s', (kind, hasEmail, restores) => {
    expect(new AccountRecoveryBo(facts({ kind, hasEmail })).restoresEmail()).toBe(restores);
  });

  it('a revert without the address to restore is refused citing the id', () => {
    const build = () =>
      new AccountRecoveryBo(facts({ kind: 'revert-email-change', hasEmail: false }));
    expect(build).toThrow(/sha:t1.*revert-email-change/);
  });
});
