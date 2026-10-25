import { z } from 'zod';
import { linkTokenDto } from '../account/account-recovery.dto';
import { newPasswordDto } from '../account/account-security.dto';
import { usernameDto } from '../account/username.dto';
import { authUserDto } from '../auth/auth-user.dto';

/** Body of the public `inspect` routes of an invitation or a new-password link. */
export const accountLinkTokenDto = z.strictObject({ token: linkTokenDto });

export type AccountLinkTokenDto = z.infer<typeof accountLinkTokenDto>;

/** Response of `POST /api/invitations/inspect`: for which address, and an @ to start from. */
export const invitationInspectResponseDto = z.strictObject({
  email: z.email(),
  suggestedUsername: z.string(),
});

export type InvitationInspectResponseDto = z.infer<typeof invitationInspectResponseDto>;

/** Body of `POST /api/invitations/accept`: the person picks the @ (the nickname starts equal to
 *  it) and the password, accepts the Terms of use and the Privacy policy (the box they tick; the
 *  server records when and which version), and leaves signed in. */
export const acceptInvitationRequestDto = z.strictObject({
  token: linkTokenDto,
  username: usernameDto,
  password: newPasswordDto,
  persistent: z.boolean(),
  acceptedTerms: z.literal(true),
});

export type AcceptInvitationRequestDto = z.infer<typeof acceptInvitationRequestDto>;

/** Response of `POST /api/invitations/accept`. */
export const acceptInvitationResponseDto = z.strictObject({
  status: z.literal('signed-in'),
  user: authUserDto,
});

export type AcceptInvitationResponseDto = z.infer<typeof acceptInvitationResponseDto>;

/** Response of `POST /api/password-resets/inspect`: whose password it changes. */
export const passwordResetInspectResponseDto = z.strictObject({ username: z.string() });

export type PasswordResetInspectResponseDto = z.infer<typeof passwordResetInspectResponseDto>;

/** Body of `POST /api/password-resets/complete`. */
export const completePasswordResetRequestDto = z.strictObject({
  token: linkTokenDto,
  newPassword: newPasswordDto,
});

export type CompletePasswordResetRequestDto = z.infer<typeof completePasswordResetRequestDto>;
