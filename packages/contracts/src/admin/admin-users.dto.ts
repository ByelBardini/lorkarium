import { z } from 'zod';
import { memberColorDto } from '../account/username.dto';
import { userRoleDto } from '../auth/auth-user.dto';

/** An account as the backoffice lists it: the e-mail opened (only an admin gets it), the status,
 *  how many tables it is in and when it was last seen. Never the hash, the 2FA nor the sessions. */
export const adminUserDto = z.strictObject({
  id: z.uuid(),
  username: z.string(),
  name: z.string(),
  email: z.email(),
  role: userRoleDto,
  status: z.enum(['active', 'suspended']),
  color: memberColorDto,
  avatarId: z.uuid().nullable(),
  campaignCount: z.number().int().nonnegative(),
  lastSeenAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export type AdminUserDto = z.infer<typeof adminUserDto>;

/** A pending invitation; "expired" is derived by the client (`expiresAt ≤ now`). `invitedBy` is the
 *  @ of who invited, `null` once that account is gone. */
export const adminInvitationDto = z.strictObject({
  id: z.uuid(),
  email: z.email(),
  role: userRoleDto,
  invitedBy: z.string().nullable(),
  sentAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});

export type AdminInvitationDto = z.infer<typeof adminInvitationDto>;

/** Response of `GET /api/admin/users`: every account and every pending invitation. */
export const adminDirectoryResponseDto = z.strictObject({
  users: z.array(adminUserDto),
  invitations: z.array(adminInvitationDto),
});

export type AdminDirectoryResponseDto = z.infer<typeof adminDirectoryResponseDto>;

/** Response of the role, suspend and reactivate routes. */
export const adminUserResponseDto = z.strictObject({ user: adminUserDto });

export type AdminUserResponseDto = z.infer<typeof adminUserResponseDto>;

/** Params of `/api/admin/users/:userId/*`. */
export const adminUserParamsDto = z.strictObject({ userId: z.uuid() });

/** Body of `PATCH /api/admin/users/:userId`. */
export const updateUserRoleRequestDto = z.strictObject({ role: userRoleDto });

export type UpdateUserRoleRequestDto = z.infer<typeof updateUserRoleRequestDto>;

/** A table the account owns where other people play: it blocks the deletion. */
export const blockingCampaignDto = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  otherMembers: z.number().int().positive(),
});

export type BlockingCampaignDto = z.infer<typeof blockingCampaignDto>;

/** Response of `GET /api/admin/users/:userId/deletion-check`: what deleting would take with it. */
export const userDeletionCheckDto = z.strictObject({
  blockingCampaigns: z.array(blockingCampaignDto),
  soloCampaigns: z.number().int().nonnegative(),
});

export type UserDeletionCheckDto = z.infer<typeof userDeletionCheckDto>;
