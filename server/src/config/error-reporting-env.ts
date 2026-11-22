import { z } from 'zod';

/** The Sentry project the server and the browser report unexpected errors to (both optional
 *  but tied to the DSN). The DSN is public by design: the client receives it too. */
export const ERROR_REPORTING_KEYS = ['SENTRY_DSN', 'SENTRY_ENVIRONMENT', 'SENTRY_RELEASE'] as const;

/** Where the reports go, the environment they are filed under, and the build that raised them;
 *  `env.errorReporting` is null without `SENTRY_DSN` (nothing leaves the app). */
export type ErrorReportingConfig = Readonly<{
  dsn: string;
  environment: string;
  /** The commit of the deploy; null = Sentry groups the events without a release. */
  release: string | null;
}>;

const DSN_SHAPE = 'must be https://<key>@<host>/<project>';

const SENTRY_DSN = z.string().trim().refine(isDsn, { error: DSN_SHAPE });

/** The schema fields `envSchema` spreads in. */
export const errorReportingEnvShape = {
  SENTRY_DSN: SENTRY_DSN.optional(),
  SENTRY_ENVIRONMENT: z.string().trim().min(1).max(64).optional(),
  SENTRY_RELEASE: z.string().trim().min(1).max(200).optional(),
};

type ErrorReportingVariables = { NODE_ENV: string } & Partial<
  Record<(typeof ERROR_REPORTING_KEYS)[number], string | undefined>
>;

/** Production reports over https only; the environment and the release mean nothing without a
 *  DSN, so setting one alone is a forgotten DSN, not a choice.
 *
 *  Example: `envSchema.superRefine(requireDsnForErrorReporting)` */
export function requireDsnForErrorReporting(
  env: ErrorReportingVariables,
  ctx: z.RefinementCtx,
): void {
  if (env.SENTRY_DSN === undefined) {
    for (const key of ['SENTRY_ENVIRONMENT', 'SENTRY_RELEASE'] as const) {
      if (env[key] === undefined) continue;
      ctx.addIssue({ code: 'custom', path: ['SENTRY_DSN'], message: `is required with ${key}` });
    }
    return;
  }
  if (env.NODE_ENV !== 'production' || env.SENTRY_DSN.startsWith('https://')) return;
  ctx.addIssue({ code: 'custom', path: ['SENTRY_DSN'], message: 'must use https in production' });
}

/** Example: `toErrorReportingConfig(parsed)?.environment // 'production'` */
export function toErrorReportingConfig(
  parsed: ErrorReportingVariables,
): ErrorReportingConfig | null {
  const dsn = parsed.SENTRY_DSN;
  if (dsn === undefined) return null;
  const environment = parsed.SENTRY_ENVIRONMENT ?? parsed.NODE_ENV;
  return { dsn, environment, release: parsed.SENTRY_RELEASE ?? null };
}

function isDsn(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  const project = url.pathname.split('/').filter(Boolean).at(-1);
  const http = url.protocol === 'https:' || url.protocol === 'http:';
  return http && url.username !== '' && project !== undefined;
}
