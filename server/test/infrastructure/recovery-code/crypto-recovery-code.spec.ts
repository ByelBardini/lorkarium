import { recoveryCodeDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { CryptoRecoveryCode } from '../../../src/infrastructure/recovery-code/crypto-recovery-code';

describe('CryptoRecoveryCode', () => {
  const codes = new CryptoRecoveryCode();

  it('draws xxxxx-xxxxx over the alphabet without 0, O, 1 and I', () => {
    for (let draw = 0; draw < 50; draw += 1) {
      expect(codes.generate()).toMatch(/^[2-9a-hj-np-z]{5}-[2-9a-hj-np-z]{5}$/);
    }
  });

  it('a drawn code is what the recovery code DTO accepts unchanged', () => {
    const code = codes.generate();
    expect(recoveryCodeDto.parse(code)).toBe(code);
  });

  it('a hundred draws do not repeat', () => {
    const drawn = new Set(Array.from({ length: 100 }, () => codes.generate()));
    expect(drawn.size).toBe(100);
  });
});
