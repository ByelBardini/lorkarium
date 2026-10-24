import { z } from 'zod';
import { PASSWORD_MAX_LENGTH } from '../auth/login.dto';

// NIST SP 800-63B-4: at least 8 (the account has 2FA available), no composition rule; the cap is
// the login's, so a giant body cannot buy expensive hashing time.
export const NEW_PASSWORD_MIN_LENGTH = 8;
export const NEW_PASSWORD_MAX_LENGTH = PASSWORD_MAX_LENGTH;

/** The password typed again to confirm a sensitive change; checked by the server, not here. */
export const currentPasswordDto = z.string().min(1).max(PASSWORD_MAX_LENGTH);

/** A new password: 8 to 256 characters. Being equal to the current one is not a rule of the DTO.
 *
 *  Example: `newPasswordDto.safeParse('1234567').success // false` */
export const newPasswordDto = z
  .string()
  .min(NEW_PASSWORD_MIN_LENGTH, {
    error: (issue) =>
      `New password has ${String(issue.input).length} characters: expected at least ${NEW_PASSWORD_MIN_LENGTH}.`,
  })
  .max(NEW_PASSWORD_MAX_LENGTH, {
    error: (issue) =>
      `New password has ${String(issue.input).length} characters: expected at most ${NEW_PASSWORD_MAX_LENGTH}.`,
  });

/** Body of `POST /api/account/password`. */
export const changePasswordRequestDto = z.strictObject({
  currentPassword: currentPasswordDto,
  newPassword: newPasswordDto,
});

export type ChangePasswordRequestDto = z.infer<typeof changePasswordRequestDto>;

/** The "Conta e segurança" section. `pendingEmail` is masked (`b*****@x.com`), never the address.
 *
 *  Example: `accountSecurityDto.parse(body.security).twoFactor.enabled // false` */
export const accountSecurityDto = z.strictObject({
  email: z.email(),
  passwordChangedAt: z.iso.datetime().nullable(),
  pendingEmail: z.string().nullable(),
  twoFactor: z.strictObject({
    enabled: z.boolean(),
    recoveryCodesLeft: z.number().int().nonnegative(),
  }),
});

export type AccountSecurityDto = z.infer<typeof accountSecurityDto>;

/** Response of `GET /api/account/security`. */
export const accountSecurityResponseDto = z.strictObject({ security: accountSecurityDto });

export type AccountSecurityResponseDto = z.infer<typeof accountSecurityResponseDto>;

// The families the user agent is read into; anything else is `other`. Edge and Opera are their
// own (they carry "Chrome" in the agent too); no version, city or IP is kept.
export const accountSessionBrowserDto = z.enum([
  'chrome',
  'edge',
  'firefox',
  'safari',
  'opera',
  'other',
]);

export type AccountSessionBrowserDto = z.infer<typeof accountSessionBrowserDto>;

export const accountSessionOsDto = z.enum(['windows', 'macos', 'linux', 'ios', 'android', 'other']);

export type AccountSessionOsDto = z.infer<typeof accountSessionOsDto>;

/** `mobile` covers phones and tablets (the agent does not tell them apart reliably). */
export const accountSessionFormFactorDto = z.enum(['desktop', 'mobile', 'other']);

export type AccountSessionFormFactorDto = z.infer<typeof accountSessionFormFactorDto>;

/** One signed-in device; `id` is the session's public id, never the token or its hash. */
export const accountSessionDto = z.strictObject({
  id: z.uuid(),
  browser: accountSessionBrowserDto,
  os: accountSessionOsDto,
  formFactor: accountSessionFormFactorDto,
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  current: z.boolean(),
});

export type AccountSessionDto = z.infer<typeof accountSessionDto>;

/** Response of `GET /api/account/sessions`. */
export const accountSessionsResponseDto = z.strictObject({
  sessions: z.array(accountSessionDto),
});

export type AccountSessionsResponseDto = z.infer<typeof accountSessionsResponseDto>;

/** Path params of `DELETE /api/account/sessions/:sessionId`. */
export const sessionParamsDto = z.strictObject({ sessionId: z.uuid() });

export type SessionParamsDto = z.infer<typeof sessionParamsDto>;

/** Response of `POST /api/account/sessions/revoke-others`: how many sessions ended. */
export const revokeOthersResponseDto = z.strictObject({
  revoked: z.number().int().nonnegative(),
});

export type RevokeOthersResponseDto = z.infer<typeof revokeOthersResponseDto>;

/** Body of `POST /api/account/email`; the e-mail is normalized like the login's.
 *
 *  Example: `changeEmailRequestDto.parse({ newEmail: ' Bia@X.com ', currentPassword: 'x' }).newEmail // 'bia@x.com'` */
export const changeEmailRequestDto = z.strictObject({
  newEmail: z.string().trim().toLowerCase().pipe(z.email()),
  currentPassword: currentPasswordDto,
});

export type ChangeEmailRequestDto = z.infer<typeof changeEmailRequestDto>;

/** Response (202) of `POST /api/account/email`: the new address, masked. */
export const changeEmailResponseDto = z.strictObject({ pendingEmail: z.string() });

export type ChangeEmailResponseDto = z.infer<typeof changeEmailResponseDto>;

// The token travels in the link's fragment; a cap keeps a pasted junk body cheap.
export const EMAIL_TOKEN_MAX_LENGTH = 256;

/** Body of `POST /api/account/email/confirm` (public): the token of the link. */
export const confirmEmailRequestDto = z.strictObject({
  token: z.string().trim().min(1).max(EMAIL_TOKEN_MAX_LENGTH),
});

export type ConfirmEmailRequestDto = z.infer<typeof confirmEmailRequestDto>;
