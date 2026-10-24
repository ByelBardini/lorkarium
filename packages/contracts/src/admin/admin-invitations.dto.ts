import { z } from 'zod';
import { userRoleDto } from '../auth/auth-user.dto';
import { adminInvitationDto } from './admin-users.dto';

/** Body of `POST /api/admin/invitations`: the address and the role the account will be born with.
 *
 *  Example: `createInvitationRequestDto.parse({ email: ' Marina@X.com ', role: 'user' }).email // 'marina@x.com'` */
export const createInvitationRequestDto = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: userRoleDto,
});

export type CreateInvitationRequestDto = z.infer<typeof createInvitationRequestDto>;

/** Params of `/api/admin/invitations/:invitationId/*`. */
export const invitationParamsDto = z.strictObject({ invitationId: z.uuid() });

/** Response of creating or resending an invitation: the link goes out once, to whoever made it. */
export const invitationLinkResponseDto = z.strictObject({
  invitation: adminInvitationDto,
  link: z.url(),
});

export type InvitationLinkResponseDto = z.infer<typeof invitationLinkResponseDto>;

/** Response of `POST /api/admin/users/:userId/password-reset`: the one-hour link. */
export const passwordResetLinkResponseDto = z.strictObject({
  link: z.url(),
  expiresAt: z.iso.datetime(),
});

export type PasswordResetLinkResponseDto = z.infer<typeof passwordResetLinkResponseDto>;
