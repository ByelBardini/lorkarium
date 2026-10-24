import { z } from 'zod';
import { recoveryCodeDto, totpCodeDto } from '../account/two-factor-code.dto';
import { authUserDto } from './auth-user.dto';

// Caps the Argon2 input so a giant body cannot buy expensive hashing time.
export const PASSWORD_MAX_LENGTH = 256;

/** Body of `POST /api/auth/login`; strict, so a forged `role` is refused.
 *
 *  Example: `loginRequestDto.parse({ email: 'Ana@Mesa.com', password: 'x' }).email // 'ana@mesa.com'` */
export const loginRequestDto = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  rememberMe: z.boolean().default(false),
});

export type LoginRequestDto = z.infer<typeof loginRequestDto>;
export type LoginRequestInput = z.input<typeof loginRequestDto>;

/** Response of `POST /api/auth/login` (and of its second step): signed in with the user, or the
 *  password was right and the account asks for a 2FA code (the challenge rides on a cookie).
 *
 *  Example: `loginResponseDto.parse(body).status === 'two-factor-required'` */
export const loginResponseDto = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('signed-in'), user: authUserDto }),
  z.strictObject({ status: z.literal('two-factor-required') }),
]);

export type LoginResponseDto = z.infer<typeof loginResponseDto>;

/** Body of `POST /api/auth/login/two-factor`: exactly one of an app code or a recovery code.
 *
 *  Example: `twoFactorLoginRequestDto.parse({ code: '123456' })` */
export const twoFactorLoginRequestDto = z.union([
  z.strictObject({ code: totpCodeDto }),
  z.strictObject({ recoveryCode: recoveryCodeDto }),
]);

export type TwoFactorLoginRequestDto = z.infer<typeof twoFactorLoginRequestDto>;
