import { z } from 'zod';

/** The keys of the Cloudflare Turnstile widget: both or none (both in production). */
export const TURNSTILE_KEYS = ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'] as const;

export const SIGN_UP_KEYS = ['REGISTRATION_OPEN', ...TURNSTILE_KEYS] as const;

/** The widget's public key (the client renders it) and the secret Siteverify checks tokens with. */
export type HumanCheckConfig = Readonly<{ siteKey: string; secretKey: string }>;

/** The public sign-up switch and the anti-bot check of the sign-up and the forgotten password. */
export type SignUpConfig = Readonly<{
  registrationOpen: boolean;
  /** null = no Turnstile (only outside production): every token passes. */
  humanCheck: HumanCheckConfig | null;
}>;

/** The schema fields `envSchema` spreads in. */
export const signUpEnvShape = {
  // Off by default: opening the sign-up waits for the ECA Digital legal review.
  REGISTRATION_OPEN: z
    .enum(['true', 'false'], { error: 'must be true or false' })
    .default('false')
    .transform((value) => value === 'true'),
  TURNSTILE_SITE_KEY: z.string().trim().min(1).optional(),
  TURNSTILE_SECRET_KEY: z.string().trim().min(1).optional(),
};

type SignUpVariables = { NODE_ENV: string } & Partial<
  Record<(typeof TURNSTILE_KEYS)[number], string | undefined>
>;

/** The forgotten-password route is always on, so production always checks for bots; elsewhere a
 *  lone key is a typo, not a choice.
 *
 *  Example: `envSchema.superRefine(requireTurnstilePair)` */
export function requireTurnstilePair(env: SignUpVariables, ctx: z.RefinementCtx): void {
  const production = env.NODE_ENV === 'production';
  if (!production && TURNSTILE_KEYS.every((key) => env[key] === undefined)) return;
  const message = production
    ? 'is required in production'
    : 'is required with the other TURNSTILE_* variable';
  for (const key of TURNSTILE_KEYS) {
    if (env[key] === undefined) ctx.addIssue({ code: 'custom', path: [key], message });
  }
}

/** Example: `toSignUpConfig(parsed).registrationOpen // false` */
export function toSignUpConfig(
  parsed: Omit<SignUpVariables, 'NODE_ENV'> & Readonly<{ REGISTRATION_OPEN: boolean }>,
): SignUpConfig {
  const { TURNSTILE_SITE_KEY: siteKey, TURNSTILE_SECRET_KEY: secretKey } = parsed;
  const humanCheck = siteKey && secretKey ? { siteKey, secretKey } : null;
  return { registrationOpen: parsed.REGISTRATION_OPEN, humanCheck };
}
