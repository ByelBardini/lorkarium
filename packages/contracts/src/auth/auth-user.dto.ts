import { z } from 'zod';
import { memberColorDto } from '../account/username.dto';
import { planLimitsDto } from '../plans/plan-limits.dto';
import { userPlanDto } from '../plans/user-plan.dto';

export const userRoleDto = z.enum(['user', 'admin']);

export type UserRoleDto = z.infer<typeof userRoleDto>;

/** The signed-in account as the client sees it; never carries the password hash. `name` is the
 *  nickname, `username` the immutable @ and `color` the effective one (chosen or drawn). `plan`
 *  is the stored one (the seal); `limits` are the effective ones, already
 *  resolved for the role (an admin gets those of `amigo_do_dono`, and so does the Dono do
 *  Lorkarium, `lorkariumOwner`: the account of the server's OWNER_USERNAME), and `customization`
 *  says whether the account's own customizations are open (custom color, dice texture, animated
 *  photo).
 *
 *  Example: `authUserDto.parse(body.user).limits.maxCampaigns // 1 on free` */
export const authUserDto = z.strictObject({
  id: z.uuid(),
  username: z.string(),
  name: z.string(),
  email: z.email(),
  role: userRoleDto,
  color: memberColorDto,
  avatarId: z.uuid().nullable(),
  plan: userPlanDto,
  lorkariumOwner: z.boolean(),
  limits: planLimitsDto,
  customization: z.boolean(),
});

export type AuthUserDto = z.infer<typeof authUserDto>;

/** Response of `GET /api/auth/me`: `user` is `null` for an anonymous visitor. */
export const meResponseDto = z.strictObject({ user: authUserDto.nullable() });

export type MeResponseDto = z.infer<typeof meResponseDto>;
