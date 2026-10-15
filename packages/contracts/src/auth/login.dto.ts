import { z } from 'zod';

// Caps the Argon2 input so a giant body cannot buy expensive hashing time.
export const PASSWORD_MAX_LENGTH = 256;

/** Body of `POST /api/auth/login`; strict, so a forged `role` is refused.
 *
 *  Example: `loginRequestDto.parse({ email: 'Ana@Mesa.com', password: 'x' }).email // 'ana@mesa.com'` */
export const loginRequestDto = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  rememberMe: z.boolean().default(false),
});

export type LoginRequestDto = z.infer<typeof loginRequestDto>;
export type LoginRequestInput = z.input<typeof loginRequestDto>;
