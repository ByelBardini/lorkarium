import { describe, expect, it } from 'vitest';
import { recoveryCodeDto, totpCodeDto } from '../../src/account/two-factor-code.dto';

describe('totpCodeDto', () => {
  it('"123 456" drops the space and gives "123456"', () => {
    expect(totpCodeDto.parse('123 456')).toBe('123456');
  });

  it.each(['12345', '1234567', '12a456'])('"%s" is refused as not 6 digits', (code) => {
    const result = totpCodeDto.safeParse(code);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      `Code "${code}" is not 6 digits.`,
    ]);
  });
});

describe('recoveryCodeDto', () => {
  it('" K7M2P-9QRST " is trimmed and lowercased', () => {
    expect(recoveryCodeDto.parse(' K7M2P-9QRST ')).toBe('k7m2p-9qrst');
  });

  it('a code typed without the hyphen gets it back', () => {
    expect(recoveryCodeDto.parse('k7m2p9qrst')).toBe('k7m2p-9qrst');
  });

  it.each(['k7m2p-9qrs0', 'k7m2p-9qrsi', 'k7m2-9qrst', '123456'])(
    '"%s" is refused as out of the xxxxx-xxxxx format',
    (code) => {
      expect(recoveryCodeDto.safeParse(code).success).toBe(false);
    },
  );
});
