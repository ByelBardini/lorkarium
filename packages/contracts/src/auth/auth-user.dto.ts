import { z } from 'zod';
import { memberColorDto } from '../account/username.dto';

export const userRoleDto = z.enum(['user', 'admin']);

export type UserRoleDto = z.infer<typeof userRoleDto>;

/** The signed-in account as the client sees it; never carries the password hash. `name` is the
 *  nickname, `username` the immutable @ and `color` the effective one (chosen or drawn).
 *
 *  Example: `authUserDto.parse(body.user).role // 'admin'` */
export const authUserDto = z.strictObject({
  id: z.uuid(),
  username: z.string(),
  name: z.string(),
  email: z.email(),
  role: userRoleDto,
  color: memberColorDto,
  avatarId: z.uuid().nullable(),
});

export type AuthUserDto = z.infer<typeof authUserDto>;

/** Response of `GET /api/auth/me`: `user` is `null` for an anonymous visitor. */
export const meResponseDto = z.strictObject({ user: authUserDto.nullable() });

export type MeResponseDto = z.infer<typeof meResponseDto>;
