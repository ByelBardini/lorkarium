import { z } from 'zod';

export const TOTP_CODE_LENGTH = 6;

/** The recovery code alphabet: base32 without 0, O, 1 and I, lowercased (~50 bits in 10). */
export const RECOVERY_CODE_ALPHABET = '23456789abcdefghjklmnpqrstuvwxyz';

/** A 6-digit code from the authenticator app; spaces typed in the middle are dropped.
 *
 *  Example: `totpCodeDto.parse('123 456') // '123456'` */
export const totpCodeDto = z
  .string()
  .transform((code) => code.replace(/\s/g, ''))
  .pipe(
    z.string().regex(/^\d{6}$/, {
      error: (issue) => `Code "${String(issue.input)}" is not ${TOTP_CODE_LENGTH} digits.`,
    }),
  );

/** A one-time recovery code, `xxxxx-xxxxx`; trimmed and lowercased, the hyphen is optional.
 *
 *  Example: `recoveryCodeDto.parse(' K7M2P9QRST ') // 'k7m2p-9qrst'` */
export const recoveryCodeDto = z
  .string()
  .trim()
  .toLowerCase()
  .transform((code) => (/^[^-]{10}$/.test(code) ? `${code.slice(0, 5)}-${code.slice(5)}` : code))
  .pipe(
    z.string().regex(/^[2-9a-hj-np-z]{5}-[2-9a-hj-np-z]{5}$/, {
      error: (issue) =>
        `Recovery code "${String(issue.input)}" is out of the format: expected xxxxx-xxxxx of ${RECOVERY_CODE_ALPHABET}.`,
    }),
  );
