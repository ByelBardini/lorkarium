import { z } from 'zod';
import { recoveryCodeDto, totpCodeDto } from '../account/two-factor-code.dto';
import { usernameDto } from '../account/username.dto';
import { authUserDto } from './auth-user.dto';

// Caps the Argon2 input so a giant body cannot buy expensive hashing time.
export const PASSWORD_MAX_LENGTH = 256;

/** What a person signs in with: the e-mail or the @ (typed with or without the "@"), trimmed and
 *  lowercased. Once parsed, an "@" is left only inside an e-mail: the @ never carries one.
 *
 *  Example: `loginIdentifierDto.parse(' @Bia ') // 'bia'` */
export const loginIdentifierDto = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.union([z.email(), z.string().transform(withoutLeadingAt).pipe(usernameDto)]));

function withoutLeadingAt(typed: string): string {
  return typed.startsWith('@') ? typed.slice(1) : typed;
}

/** Body of `POST /api/auth/login`; strict, so a forged `role` is refused.
 *
 *  Example: `loginRequestDto.parse({ identifier: '@Bia', password: 'x' }).identifier // 'bia'` */
export const loginRequestDto = z.strictObject({
  identifier: loginIdentifierDto,
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
