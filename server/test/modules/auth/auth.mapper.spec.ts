import { describe, expect, it } from 'vitest';
import {
  recoveryCodeIndexOf,
  toAuthUserDto,
  toSealedEmail,
  toSecondFactor,
  toTwoFactorBo,
} from '../../../src/modules/auth/auth.mapper';
import { DataCipherFake } from '../../support/auth-fakes';
import { ANA_ID, userPo } from '../../support/auth-factories';

const AVATAR_ID = '9b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';

describe('toAuthUserDto', () => {
  it('a full user row becomes the client view: e-mail opened with the id, no hash nor createdAt', () => {
    const row = userPo({ name: 'Ana', email: 'ana@mesa.com', role: 'admin', avatarId: AVATAR_ID });
    expect(toAuthUserDto(row, new DataCipherFake())).toEqual({
      id: ANA_ID,
      username: 'ana',
      name: 'Ana',
      email: 'ana@mesa.com',
      role: 'admin',
      // stableHash(ANA_ID) % 8 = 6: the automatic color, the same index the ping drew before.
      color: 'teal',
      avatarId: AVATAR_ID,
    });
  });

  it('a chosen color wins over the drawn one', () => {
    const row = userPo({ color: 'moss' });
    expect(toAuthUserDto(row, new DataCipherFake()).color).toBe('moss');
  });

  it('an e-mail sealed for another account does not open', () => {
    const row = { ...userPo(), emailCipher: 'sealed:user-email:someone-else:ana@mesa.com' };
    expect(() => toAuthUserDto(row, new DataCipherFake())).toThrow(/user-email/);
  });
});

describe('toSealedEmail', () => {
  it('seals the e-mail with the id as context and indexes it for the lookup', () => {
    expect(toSealedEmail(new DataCipherFake(), 'u1', 'bia@x.com')).toEqual({
      emailCipher: 'sealed:user-email:u1:bia@x.com',
      emailIndex: 'idx:email-index:bia@x.com',
    });
  });
});

describe('toSecondFactor', () => {
  it('six digits are an app code', () => {
    expect(toSecondFactor('287082')).toEqual({ kind: 'totp', code: '287082' });
  });

  it('a xxxxx-xxxxx code is a recovery code', () => {
    expect(toSecondFactor('k7m2p-9qrst')).toEqual({ kind: 'recovery', code: 'k7m2p-9qrst' });
  });
});

describe('toTwoFactorBo', () => {
  it('no row means 2FA off', () => {
    expect(() => toTwoFactorBo(ANA_ID, undefined).requireEnabled()).toThrow(
      expect.objectContaining({ code: 'TWO_FACTOR_CODE_INVALID' }),
    );
  });

  it('a row with enabled_at is on and carries its last step (a replay of it is refused)', () => {
    const row = {
      userId: ANA_ID,
      secretCipher: 'sealed',
      enabledAt: new Date('2026-10-02T12:00:00Z'),
      lastStep: 40,
      createdAt: new Date('2026-10-02T12:00:00Z'),
    };
    const bo = toTwoFactorBo(ANA_ID, row);
    expect(() => bo.requireEnabled()).not.toThrow();
    expect(() => bo.acceptTotp(40, 40)).toThrow(
      expect.objectContaining({ refusal: 'the code was already used' }),
    );
  });
});

describe('recoveryCodeIndexOf', () => {
  it('indexes the code under the recovery-code purpose', () => {
    expect(recoveryCodeIndexOf(new DataCipherFake(), 'k7m2p-9qrst')).toBe(
      'idx:recovery-code:k7m2p-9qrst',
    );
  });
});
