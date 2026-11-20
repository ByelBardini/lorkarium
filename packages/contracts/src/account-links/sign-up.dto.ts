import { z } from 'zod';
import { loginIdentifierDto } from '../auth/login.dto';

// Cloudflare documents Turnstile tokens of up to 2048 characters.
const HUMAN_CHECK_TOKEN_MAX_LENGTH = 2048;

/** The token the anti-bot widget (Cloudflare Turnstile) puts in the form; the server checks it.
 *
 *  Example: `humanCheckTokenDto.parse('0.xyz…')` */
export const humanCheckTokenDto = z.string().min(1).max(HUMAN_CHECK_TOKEN_MAX_LENGTH);

/** Body of `POST /api/sign-up`: only the address; the @ and the password come with the link.
 *
 *  Example: `signUpRequestDto.parse({ email: ' Ana@X.com ', humanCheckToken: 't' }).email // 'ana@x.com'` */
export const signUpRequestDto = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  humanCheckToken: humanCheckTokenDto,
});

export type SignUpRequestDto = z.infer<typeof signUpRequestDto>;

/** Body of `POST /api/password-resets/request`: the e-mail or the @, as in the login.
 *
 *  Example: `passwordResetRequestDto.parse({ identifier: '@Ana', humanCheckToken: 't' }).identifier // 'ana'` */
export const passwordResetRequestDto = z.strictObject({
  identifier: loginIdentifierDto,
  humanCheckToken: humanCheckTokenDto,
});

export type PasswordResetRequestDto = z.infer<typeof passwordResetRequestDto>;

/** Response of `GET /api/sign-up/settings` (public): whether to show "Criar conta", and the
 *  Turnstile site key (null where no key is configured, outside production).
 *
 *  Example: `signUpSettingsDto.parse({ registrationOpen: false, humanCheckSiteKey: null })` */
export const signUpSettingsDto = z.strictObject({
  registrationOpen: z.boolean(),
  humanCheckSiteKey: z.string().min(1).nullable(),
});

export type SignUpSettingsDto = z.infer<typeof signUpSettingsDto>;
