import { z } from 'zod';

export const userRoleDto = z.enum(['user', 'admin']);

export type UserRoleDto = z.infer<typeof userRoleDto>;

/** The signed-in account as the client sees it; never carries the password hash.
 *
 *  Example: `authUserDto.parse(body.user).role // 'admin'` */
export const authUserDto = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: userRoleDto,
});

export type AuthUserDto = z.infer<typeof authUserDto>;

/** Response of `POST /api/auth/login`. */
export const loginResponseDto = z.strictObject({ user: authUserDto });

export type LoginResponseDto = z.infer<typeof loginResponseDto>;

/** Response of `GET /api/auth/me`: `user` is `null` for an anonymous visitor. */
export const meResponseDto = z.strictObject({ user: authUserDto.nullable() });

export type MeResponseDto = z.infer<typeof meResponseDto>;
