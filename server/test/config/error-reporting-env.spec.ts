import { describe, expect, it } from 'vitest';
import { InvalidEnvError, readEnv } from '../../src/config/env';

const REQUIRED = {
  DATABASE_URL: 'postgres://lorkarium:lorkarium@localhost:5432/lorkarium',
  S3_ENDPOINT: 'http://localhost:8333',
  S3_BUCKET: 'lorkarium',
  S3_ACCESS_KEY_ID: 'lorkarium',
  S3_SECRET_ACCESS_KEY: 'lorkarium-dev-secret',
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
};
const PRODUCTION = {
  ...REQUIRED,
  NODE_ENV: 'production',
  SMTP_URL: 'smtp://localhost:1025',
  APP_PUBLIC_URL: 'https://mesa.example.com',
  SITE_PUBLIC_URL: 'https://example.com',
  ACCESS_LOG_S3_BUCKET: 'lorkarium-access-log',
  ACCESS_LOG_S3_ACCESS_KEY_ID: 'lorkarium-access-log',
  ACCESS_LOG_S3_SECRET_ACCESS_KEY: 'segredo-do-registro',
  TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
  TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
};
const DSN = 'https://abc@o1.ingest.de.sentry.io/123';
const DSN_SHAPE = 'must be https://<key>@<host>/<project>';

function problemsOf(source: Record<string, string>): readonly string[] {
  try {
    readEnv(source);
    return [];
  } catch (error) {
    return error instanceof InvalidEnvError ? error.problems : [String(error)];
  }
}

describe('readEnv, SENTRY_DSN', () => {
  it('absent leaves error reporting off', () => {
    expect(readEnv(REQUIRED).errorReporting).toBeNull();
  });

  it('empty counts as absent', () => {
    expect(readEnv({ ...REQUIRED, SENTRY_DSN: '' }).errorReporting).toBeNull();
  });

  it('in production takes the node environment and no release', () => {
    expect(readEnv({ ...PRODUCTION, SENTRY_DSN: DSN }).errorReporting).toEqual({
      dsn: DSN,
      environment: 'production',
      release: null,
    });
  });

  it('carries SENTRY_ENVIRONMENT and SENTRY_RELEASE', () => {
    const env = readEnv({
      ...PRODUCTION,
      SENTRY_DSN: DSN,
      SENTRY_ENVIRONMENT: 'staging',
      SENTRY_RELEASE: '80352806',
    });
    expect(env.errorReporting).toEqual({ dsn: DSN, environment: 'staging', release: '80352806' });
  });

  it('accepts http outside production (a local relay)', () => {
    const dsn = 'http://chave@localhost:9000/1';
    expect(readEnv({ ...REQUIRED, SENTRY_DSN: dsn }).errorReporting?.dsn).toBe(dsn);
  });

  it.each([
    ['without key', 'https://o1.ingest.de.sentry.io/123'],
    ['without project', 'https://abc@o1.ingest.de.sentry.io/'],
    ['not a URL', 'abc'],
  ])('refuses a DSN %s citing the value and the shape', (_case, dsn) => {
    expect(problemsOf({ ...REQUIRED, SENTRY_DSN: dsn })).toEqual([
      `SENTRY_DSN ${DSN_SHAPE} (received "${dsn}")`,
    ]);
  });

  it('refuses http in production citing the value', () => {
    const dsn = 'http://abc@o1.ingest.de.sentry.io/123';
    expect(problemsOf({ ...PRODUCTION, SENTRY_DSN: dsn })).toEqual([
      `SENTRY_DSN must use https in production (received "${dsn}")`,
    ]);
  });

  it.each(['SENTRY_ENVIRONMENT', 'SENTRY_RELEASE'] as const)(
    'refuses %s without SENTRY_DSN (a forgotten DSN does not pass silently)',
    (key) => {
      expect(problemsOf({ ...REQUIRED, [key]: 'x' })).toEqual([
        `SENTRY_DSN is required with ${key} (received nothing)`,
      ]);
    },
  );
});
