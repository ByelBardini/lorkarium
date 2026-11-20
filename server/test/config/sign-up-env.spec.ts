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
};
// The test keys Cloudflare publishes: a widget and a secret that always pass.
const KEYS = {
  TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
  TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
};

function problemsOf(source: Record<string, string>): readonly string[] {
  try {
    readEnv(source);
    return [];
  } catch (error) {
    return error instanceof InvalidEnvError ? error.problems : [String(error)];
  }
}

describe('readEnv, REGISTRATION_OPEN', () => {
  it('absent keeps the public sign-up closed', () => {
    expect(readEnv(REQUIRED).signUp.registrationOpen).toBe(false);
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('"%s" sets the switch to %s', (value, open) => {
    expect(readEnv({ ...REQUIRED, REGISTRATION_OPEN: value }).signUp.registrationOpen).toBe(open);
  });

  it('"sim" is refused citing the value and the accepted shape', () => {
    expect(problemsOf({ ...REQUIRED, REGISTRATION_OPEN: 'sim' })).toEqual([
      'REGISTRATION_OPEN must be true or false (received "sim")',
    ]);
  });
});

describe('readEnv, the Turnstile keys', () => {
  it('outside production without the two keys there is no human check', () => {
    expect(readEnv(REQUIRED).signUp.humanCheck).toBeNull();
  });

  it('the two keys become the human check config', () => {
    expect(readEnv({ ...REQUIRED, ...KEYS }).signUp.humanCheck).toEqual({
      siteKey: '1x00000000000000000000AA',
      secretKey: '1x0000000000000000000000000000000AA',
    });
  });

  it.each(['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'] as const)(
    'outside production %s alone is refused naming the missing one',
    (present) => {
      const missing =
        present === 'TURNSTILE_SITE_KEY' ? 'TURNSTILE_SECRET_KEY' : 'TURNSTILE_SITE_KEY';
      expect(problemsOf({ ...REQUIRED, [present]: KEYS[present] })).toEqual([
        `${missing} is required with the other TURNSTILE_* variable (received nothing)`,
      ]);
    },
  );

  it('production without the keys is refused naming each one', () => {
    expect(problemsOf(PRODUCTION)).toEqual([
      'TURNSTILE_SITE_KEY is required in production (received nothing)',
      'TURNSTILE_SECRET_KEY is required in production (received nothing)',
    ]);
  });

  it('production with the keys boots, sign-up still closed by default', () => {
    expect(readEnv({ ...PRODUCTION, ...KEYS }).signUp).toEqual({
      registrationOpen: false,
      humanCheck: {
        siteKey: '1x00000000000000000000AA',
        secretKey: '1x0000000000000000000000000000000AA',
      },
    });
  });
});
