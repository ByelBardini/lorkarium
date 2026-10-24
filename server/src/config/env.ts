import { z } from 'zod';

// Enforced only in production: a local dev box may seed admin@admin.com / admin.
export const ADMIN_PASSWORD_MIN_LENGTH = 12;

const ENV_KEYS = [
  'NODE_ENV',
  'PORT',
  'HOST',
  'DATABASE_URL',
  'DATABASE_POOL_MAX',
  'DATABASE_STATEMENT_TIMEOUT_MS',
  'DATABASE_LOCK_TIMEOUT_MS',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_FORCE_PATH_STYLE',
  'DATA_ENCRYPTION_KEY',
  'SMTP_URL',
  'MAIL_FROM',
  'APP_PUBLIC_URL',
] as const;

// Values that must never reach a log line or a boot error message.
const SECRET_KEYS: ReadonlySet<string> = new Set([
  'DATABASE_URL',
  'ADMIN_PASSWORD',
  'S3_SECRET_ACCESS_KEY',
  'DATA_ENCRYPTION_KEY',
  // smtp://user:password@host:port carries the password.
  'SMTP_URL',
]);

export const S3_SECRET_MIN_LENGTH = 8;

const PORT_RULE = 'must be an integer between 1 and 65535';

export const DATA_ENCRYPTION_KEY_BYTES = 32;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

// The master key of the field encryption (e-mail, 2FA secret): never optional, or a dev box would
// write data no other box opens. Generate one with `openssl rand -base64 32`.
const DATA_ENCRYPTION_KEY = z
  .string({ error: `is required; expected ${DATA_ENCRYPTION_KEY_BYTES} bytes (base64)` })
  .transform((value, ctx): Buffer => {
    const key = Buffer.from(value, 'base64');
    if (BASE64.test(value) && key.length === DATA_ENCRYPTION_KEY_BYTES) return key;
    const decoded = BASE64.test(value) ? `decodes to ${key.length} bytes` : 'is not base64';
    ctx.addIssue({
      code: 'custom',
      message: `${decoded}; expected ${DATA_ENCRYPTION_KEY_BYTES} bytes (base64)`,
    });
    return z.NEVER;
  });

export const DEFAULT_MAIL_FROM = 'Lorkarium <no-reply@lorkarium.dev>';

// The client of `pnpm dev`; production must say where the app lives (the e-mail links point there).
export const DEFAULT_APP_PUBLIC_URL = 'http://localhost:5173';

const SMTP_SCHEMES: ReadonlySet<string> = new Set(['smtp:', 'smtps:']);

const SMTP_URL = z
  .url({ error: 'must be a URL (smtp://localhost:1025)' })
  .refine((value) => SMTP_SCHEMES.has(new URL(value).protocol), {
    error: 'must start with smtp:// or smtps://',
  })
  .optional();

/** An integer variable in `[min, max]` with a default; the rule text names the range. */
function boundedInteger(min: number, max: number, fallback: number, unit = ''): z.ZodType<number> {
  const rule = `must be an integer from ${min} to ${max}${unit}`;
  return z.coerce
    .number({ error: rule })
    .int({ error: rule })
    .min(min, { error: rule })
    .max(max, { error: rule })
    .default(fallback);
}

// Up to 100 connections: Postgres' own default max_connections is 100.
const POOL_MAX = boundedInteger(1, 100, 10);
// A statement past 5 s on a table this size is a bug; the lock wait is shorter so a stuck scene
// lock surfaces as an error instead of holding connections (never 0: that waits forever).
const STATEMENT_TIMEOUT_MS = boundedInteger(100, 600_000, 5000, ' milliseconds');
const LOCK_TIMEOUT_MS = boundedInteger(100, 600_000, 2000, ' milliseconds');

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
    DATABASE_POOL_MAX: POOL_MAX,
    DATABASE_STATEMENT_TIMEOUT_MS: STATEMENT_TIMEOUT_MS,
    DATABASE_LOCK_TIMEOUT_MS: LOCK_TIMEOUT_MS,
    ADMIN_EMAIL: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email({ error: 'must be an e-mail address' }))
      .optional(),
    ADMIN_PASSWORD: z.string().optional(),
    S3_ENDPOINT: z.url({ error: 'must be a URL (http://localhost:8333)' }),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string({ error: 'is required (the bucket that keeps the assets)' }),
    S3_ACCESS_KEY_ID: z.string({ error: 'is required' }),
    S3_SECRET_ACCESS_KEY: z.string({ error: 'is required' }).min(S3_SECRET_MIN_LENGTH, {
      error: `must have at least ${S3_SECRET_MIN_LENGTH} characters`,
    }),
    S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false'], { error: 'must be true or false' })
      .default('true')
      .transform((value) => value === 'true'),
    DATA_ENCRYPTION_KEY,
    SMTP_URL,
    MAIL_FROM: z.string().trim().min(3).default(DEFAULT_MAIL_FROM),
    APP_PUBLIC_URL: z.url({ error: 'must be a URL (https://mesa.example.com)' }).optional(),
  })
  .superRefine(requireAdminPair)
  .superRefine(requireStrongAdminPasswordInProduction)
  .superRefine(requireMailInProduction);

type ParsedEnv = z.infer<typeof envSchema>;

export type NodeEnv = ParsedEnv['NODE_ENV'];

export type AdminSeedConfig = Readonly<{ email: string; password: string }>;

/** Where the assets live: any S3-compatible service (SeaweedFS in dev, §4.3). */
export type StorageConfig = Readonly<{
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}>;

/** The `pg` pool size and the per-connection timeouts (spec §5.7: one instance). */
export type DatabaseConfig = Readonly<{
  poolMax: number;
  statementTimeoutMs: number;
  lockTimeoutMs: number;
}>;

/** How e-mail leaves: SMTP (Mailpit in dev), or only the log outside production. */
export type MailerConfig =
  Readonly<{ kind: 'smtp'; url: string; from: string }> | Readonly<{ kind: 'log'; from: string }>;

export type Env = Readonly<{
  nodeEnv: NodeEnv;
  port: number;
  host: string;
  databaseUrl: string;
  database: DatabaseConfig;
  adminSeed: AdminSeedConfig | null;
  storage: StorageConfig;
  /** 32 bytes; the master key the data cipher derives its per-purpose subkeys from. */
  dataEncryptionKey: Buffer;
  mailer: MailerConfig;
  /** Where the client is served, without a trailing slash: the base of the links in e-mails. */
  appPublicUrl: string;
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

type MailVariables = {
  NODE_ENV: string;
  SMTP_URL?: string | undefined;
  APP_PUBLIC_URL?: string | undefined;
};

// Production never falls back to the log mailer nor to localhost links.
function requireMailInProduction(env: MailVariables, ctx: z.RefinementCtx): void {
  if (env.NODE_ENV !== 'production') return;
  if (env.SMTP_URL === undefined) {
    ctx.addIssue({ code: 'custom', path: ['SMTP_URL'], message: 'is required in production' });
  }
  if (env.APP_PUBLIC_URL === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['APP_PUBLIC_URL'],
      message: 'is required in production',
    });
  }
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
    database: {
      poolMax: parsed.DATABASE_POOL_MAX,
      statementTimeoutMs: parsed.DATABASE_STATEMENT_TIMEOUT_MS,
      lockTimeoutMs: parsed.DATABASE_LOCK_TIMEOUT_MS,
    },
    adminSeed: email && password ? { email, password } : null,
    storage: {
      endpoint: parsed.S3_ENDPOINT,
      region: parsed.S3_REGION,
      bucket: parsed.S3_BUCKET,
      accessKeyId: parsed.S3_ACCESS_KEY_ID,
      secretAccessKey: parsed.S3_SECRET_ACCESS_KEY,
      forcePathStyle: parsed.S3_FORCE_PATH_STYLE,
    },
    dataEncryptionKey: parsed.DATA_ENCRYPTION_KEY,
    mailer: toMailerConfig(parsed),
    appPublicUrl: (parsed.APP_PUBLIC_URL ?? DEFAULT_APP_PUBLIC_URL).replace(/\/+$/, ''),
  };
}

function toMailerConfig(parsed: ParsedEnv): MailerConfig {
  const from = parsed.MAIL_FROM;
  return parsed.SMTP_URL ? { kind: 'smtp', url: parsed.SMTP_URL, from } : { kind: 'log', from };
}
