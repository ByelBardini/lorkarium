import { z } from 'zod';
import { EMAIL_TOKEN_MAX_LENGTH, newPasswordDto } from './account-security.dto';

/** The token of a one-time link (recovery, invitation, new password): it rides in the URL
 *  fragment and comes back in a POST body. */
export const linkTokenDto = z.string().trim().min(1).max(EMAIL_TOKEN_MAX_LENGTH);

/** What a recovery link undoes: the pending e-mail change, the finished one, or the password. */
export const accountRecoveryKindDto = z.enum([
  'cancel-email-change',
  'revert-email-change',
  'revert-password-change',
]);

export type AccountRecoveryKindDto = z.infer<typeof accountRecoveryKindDto>;

/** Body of `POST /api/account/recovery/check` (public). */
export const accountRecoveryTokenDto = z.strictObject({ token: linkTokenDto });

export type AccountRecoveryTokenDto = z.infer<typeof accountRecoveryTokenDto>;

/** Body of `POST /api/account/recovery` (public): the link and the password that replaces the
 *  current one in the same step. */
export const accountRecoveryRequestDto = z.strictObject({
  token: linkTokenDto,
  newPassword: newPasswordDto,
});

export type AccountRecoveryRequestDto = z.infer<typeof accountRecoveryRequestDto>;

/** What the link will do. `email` is masked: the pending address (cancel), the one coming back
 *  (revert) or `null` (password). */
export const accountRecoveryCheckResponseDto = z.strictObject({
  recovery: z.strictObject({
    kind: accountRecoveryKindDto,
    email: z.string().nullable(),
  }),
});

export type AccountRecoveryCheckResponseDto = z.infer<typeof accountRecoveryCheckResponseDto>;
