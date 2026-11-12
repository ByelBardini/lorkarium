import { z } from 'zod';
import { memberColorDto } from '../account/username.dto';
import { userRoleDto } from '../auth/auth-user.dto';
import { userPlanDto } from '../plans/user-plan.dto';

/** An account as the backoffice lists it: the e-mail opened (only an admin gets it), the status,
 *  how many tables it is in and when it was last seen. `plan` is the stored one (an admin's too,
 *  though the admin has no plan limit) and `lorkariumOwner` whether
 *  it is the Dono do Lorkarium (OWNER_USERNAME). Never the hash, the 2FA nor the sessions. */
export const adminUserDto = z.strictObject({
  id: z.uuid(),
  username: z.string(),
  name: z.string(),
  email: z.email(),
  role: userRoleDto,
  plan: userPlanDto,
  lorkariumOwner: z.boolean(),
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

/** Response of the role, plan, suspend and reactivate routes. */
export const adminUserResponseDto = z.strictObject({ user: adminUserDto });

export type AdminUserResponseDto = z.infer<typeof adminUserResponseDto>;

/** Params of `/api/admin/users/:userId/*`. */
export const adminUserParamsDto = z.strictObject({ userId: z.uuid() });

/** Body of `PATCH /api/admin/users/:userId`. */
export const updateUserRoleRequestDto = z.strictObject({ role: userRoleDto });

export type UpdateUserRoleRequestDto = z.infer<typeof updateUserRoleRequestDto>;

/** Body of `PATCH /api/admin/users/:userId/plan`.
 *
 *  Example: `updateUserPlanRequestDto.parse({ plan: 'lenda' })` */
export const updateUserPlanRequestDto = z.strictObject({ plan: userPlanDto });

export type UpdateUserPlanRequestDto = z.infer<typeof updateUserPlanRequestDto>;

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
