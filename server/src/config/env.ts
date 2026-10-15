import { z } from 'zod';

// Enforced only in production: a local dev box may seed admin@admin.com / admin.
export const ADMIN_PASSWORD_MIN_LENGTH = 12;

const ENV_KEYS = [
  'NODE_ENV',
  'PORT',
  'HOST',
  'DATABASE_URL',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
] as const;

// Values that must never reach a log line or a boot error message.
const SECRET_KEYS: ReadonlySet<string> = new Set(['DATABASE_URL', 'ADMIN_PASSWORD']);

const PORT_RULE = 'must be an integer between 1 and 65535';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce
      .number({ error: PORT_RULE })
      .int({ error: PORT_RULE })
      .min(1, { error: PORT_RULE })
      .max(65535, { error: PORT_RULE })
      .default(3333),
    HOST: z.string().default('0.0.0.0'),
    DATABASE_URL: z.string({ error: 'is required (postgres://user:password@host:port/db)' }),
    ADMIN_EMAIL: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email({ error: 'must be an e-mail address' }))
      .optional(),
    ADMIN_PASSWORD: z.string().optional(),
  })
  .superRefine(requireAdminPair)
  .superRefine(requireStrongAdminPasswordInProduction);

type ParsedEnv = z.infer<typeof envSchema>;

export type NodeEnv = ParsedEnv['NODE_ENV'];

export type AdminSeedConfig = Readonly<{ email: string; password: string }>;

export type Env = Readonly<{
  nodeEnv: NodeEnv;
  port: number;
  host: string;
  databaseUrl: string;
  adminSeed: AdminSeedConfig | null;
}>;

export class InvalidEnvError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid environment: ${problems.join('; ')}`);
    this.name = 'InvalidEnvError';
  }
}

/** The validated environment; refuses to boot citing every bad variable (secrets redacted).
 *
 *  Example: `readEnv(process.env).port // 3333` */
export function readEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(pickKnownKeys(source));
  if (!result.success) throw new InvalidEnvError(describeIssues(result.error.issues, source));
  return toEnv(result.data);
}

type AdminPair = { ADMIN_EMAIL?: string | undefined; ADMIN_PASSWORD?: string | undefined };

function requireStrongAdminPasswordInProduction(
  env: AdminPair & { NODE_ENV: string },
  ctx: z.RefinementCtx,
): void {
  if (env.NODE_ENV !== 'production' || env.ADMIN_PASSWORD === undefined) return;
  if (env.ADMIN_PASSWORD.length >= ADMIN_PASSWORD_MIN_LENGTH) return;
  ctx.addIssue({
    code: 'custom',
    path: ['ADMIN_PASSWORD'],
    message: `must have at least ${ADMIN_PASSWORD_MIN_LENGTH} characters in production`,
  });
}

function requireAdminPair(env: AdminPair, ctx: z.RefinementCtx): void {
  if (env.ADMIN_EMAIL !== undefined && env.ADMIN_PASSWORD === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['ADMIN_PASSWORD'],
      message: 'is required with ADMIN_EMAIL',
    });
  }
  if (env.ADMIN_PASSWORD !== undefined && env.ADMIN_EMAIL === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['ADMIN_EMAIL'],
      message: 'is required with ADMIN_PASSWORD',
    });
  }
}

// An empty `KEY=` line in .env means "not set", not "set to an empty string".
function pickKnownKeys(source: Record<string, string | undefined>): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const key of ENV_KEYS) {
    const value = source[key];
    if (value !== undefined && value !== '') picked[key] = value;
  }
  return picked;
}

function describeIssues(
  issues: readonly z.core.$ZodIssue[],
  source: Record<string, string | undefined>,
): string[] {
  return issues.map((issue) => {
    const key = String(issue.path[0] ?? 'environment');
    return `${key} ${issue.message} (received ${describeReceived(key, source[key])})`;
  });
}

function describeReceived(key: string, value: string | undefined): string {
  if (value === undefined || value === '') return 'nothing';
  return SECRET_KEYS.has(key) ? 'a redacted value' : JSON.stringify(value);
}

function toEnv(parsed: ParsedEnv): Env {
  const { ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = parsed;
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    host: parsed.HOST,
    databaseUrl: parsed.DATABASE_URL,
    adminSeed: email && password ? { email, password } : null,
  };
}
