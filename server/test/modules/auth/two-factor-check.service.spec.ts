import { beforeEach, describe, expect, it } from 'vitest';
import { TwoFactorCheckService } from '../../../src/modules/auth/two-factor-check.service';
import type { UserTwoFactorPo } from '../../../src/modules/auth/two-factor.po';
import { ClockFake, DataCipherFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { RecoveryCodesDaoFake, TotpFake, TwoFactorDaoFake } from '../../support/two-factor-fakes';

const NOW = new Date('2026-04-01T00:00:00Z');
const CURRENT_STEP = Math.floor(NOW.getTime() / 30_000);

function enabledRow(lastStep: number | null = null): UserTwoFactorPo {
  return {
    userId: ANA_ID,
    secretCipher: `sealed:totp-secret:${ANA_ID}:ANASECRET`,
    enabledAt: new Date('2026-03-01T00:00:00Z'),
    lastStep,
    createdAt: new Date('2026-03-01T00:00:00Z'),
  };
}

describe('TwoFactorCheckService', () => {
  let twoFactor: TwoFactorDaoFake;
  let recoveryCodes: RecoveryCodesDaoFake;
  let totp: TotpFake;
  let check: TwoFactorCheckService;

  beforeEach(() => {
    twoFactor = new TwoFactorDaoFake();
    recoveryCodes = new RecoveryCodesDaoFake();
    totp = new TotpFake();
    const deps = { twoFactor, recoveryCodes, totp, cipher: new DataCipherFake() };
    check = new TwoFactorCheckService({ ...deps, clock: new ClockFake(NOW) });
    twoFactor.rows.set(ANA_ID, enabledRow());
  });

  it('a right app code is accepted against the opened secret and its step recorded', async () => {
    totp.stepsByCode.set('111111', CURRENT_STEP);
    await check.verify(ANA_ID, { kind: 'totp', code: '111111' });
    expect(totp.secretsAsked).toEqual(['ANASECRET']);
    expect(twoFactor.rows.get(ANA_ID)?.lastStep).toBe(CURRENT_STEP);
  });

  it('the same app code twice: the second is refused as already used', async () => {
    totp.stepsByCode.set('111111', CURRENT_STEP);
    await check.verify(ANA_ID, { kind: 'totp', code: '111111' });
    await expect(check.verify(ANA_ID, { kind: 'totp', code: '111111' })).rejects.toMatchObject({
      code: 'TWO_FACTOR_CODE_INVALID',
      refusal: 'the code was already used',
    });
  });

  it('a wrong app code is refused and nothing is recorded', async () => {
    await expect(check.verify(ANA_ID, { kind: 'totp', code: '999999' })).rejects.toMatchObject({
      code: 'TWO_FACTOR_CODE_INVALID',
    });
    expect(twoFactor.rows.get(ANA_ID)?.lastStep).toBeNull();
  });

  it('a step taken by a concurrent request between the read and the write is refused', async () => {
    totp.stepsByCode.set('111111', CURRENT_STEP);
    twoFactor.recordStep = async () => false;
    await expect(check.verify(ANA_ID, { kind: 'totp', code: '111111' })).rejects.toMatchObject({
      refusal: 'the code was already used',
    });
  });

  it('an unused recovery code is accepted once and marked used', async () => {
    await recoveryCodes.replace(ANA_ID, ['idx:recovery-code:k7m2p-9qrst']);
    await check.verify(ANA_ID, { kind: 'recovery', code: 'k7m2p-9qrst' });
    expect(recoveryCodes.rows[0]?.usedAt).toEqual(NOW);
    await expect(
      check.verify(ANA_ID, { kind: 'recovery', code: 'k7m2p-9qrst' }),
    ).rejects.toMatchObject({ refusal: 'the recovery code was already used' });
  });

  it('a recovery code of another user does not serve', async () => {
    await recoveryCodes.replace('user-bia', ['idx:recovery-code:k7m2p-9qrst']);
    await expect(
      check.verify(ANA_ID, { kind: 'recovery', code: 'k7m2p-9qrst' }),
    ).rejects.toMatchObject({ refusal: 'the recovery code is unknown' });
  });

  it('a pending setup does not verify: 2FA is not on yet', async () => {
    twoFactor.rows.set(ANA_ID, { ...enabledRow(), enabledAt: null });
    totp.stepsByCode.set('111111', CURRENT_STEP);
    await expect(check.verify(ANA_ID, { kind: 'totp', code: '111111' })).rejects.toMatchObject({
      refusal: 'two-factor is not enabled',
    });
  });

  it('isEnabled is true only with enabled_at', async () => {
    expect(await check.isEnabled(ANA_ID)).toBe(true);
    twoFactor.rows.set(ANA_ID, { ...enabledRow(), enabledAt: null });
    expect(await check.isEnabled(ANA_ID)).toBe(false);
    expect(await check.isEnabled('user-bia')).toBe(false);
  });

  it('acceptTotp on a pending row returns the step without recording it', () => {
    const pending = { ...enabledRow(), enabledAt: null };
    totp.stepsByCode.set('222222', CURRENT_STEP - 1);
    expect(check.acceptTotp(pending, '222222')).toBe(CURRENT_STEP - 1);
    expect(twoFactor.rows.get(ANA_ID)?.lastStep).toBeNull();
  });
});
