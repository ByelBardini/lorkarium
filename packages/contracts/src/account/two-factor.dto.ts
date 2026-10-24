import { z } from 'zod';
import { currentPasswordDto } from './account-security.dto';
import { recoveryCodeDto, totpCodeDto } from './two-factor-code.dto';

/** Recovery codes handed out when 2FA is turned on (and on every regeneration). */
export const RECOVERY_CODE_COUNT = 10;

/** Body of `POST /api/account/two-factor/setup`. */
export const twoFactorSetupRequestDto = z.strictObject({ currentPassword: currentPasswordDto });

export type TwoFactorSetupRequestDto = z.infer<typeof twoFactorSetupRequestDto>;

/** The pending secret: the key in base32, the `otpauth://` URI and the QR as a PNG data URL. */
export const twoFactorSetupResponseDto = z.strictObject({
  secret: z.string().min(1),
  otpauthUri: z.string().startsWith('otpauth://'),
  qrImage: z.string().startsWith('data:image/png;base64,'),
});

export type TwoFactorSetupResponseDto = z.infer<typeof twoFactorSetupResponseDto>;

/** Body of `POST /api/account/two-factor/enable`: the first code from the app. */
export const twoFactorEnableRequestDto = z.strictObject({ code: totpCodeDto });

export type TwoFactorEnableRequestDto = z.infer<typeof twoFactorEnableRequestDto>;

/** The 10 recovery codes, shown once (enable and regenerate). */
export const recoveryCodesResponseDto = z.strictObject({
  recoveryCodes: z.array(recoveryCodeDto).length(RECOVERY_CODE_COUNT),
});

export type RecoveryCodesResponseDto = z.infer<typeof recoveryCodesResponseDto>;

/** Body of `disable` and `recovery-codes`: the password plus an app code or a recovery code.
 *
 *  Example: `twoFactorConfirmRequestDto.parse({ currentPassword: 'x', code: 'k7m2p-9qrst' })` */
export const twoFactorConfirmRequestDto = z.strictObject({
  currentPassword: currentPasswordDto,
  code: z.union([totpCodeDto, recoveryCodeDto]),
});

export type TwoFactorConfirmRequestDto = z.infer<typeof twoFactorConfirmRequestDto>;
