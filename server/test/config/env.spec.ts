import { describe, expect, it } from 'vitest';
import { readEnv } from '../../src/config/env';

const DATABASE_URL = 'postgres://lorkarium:lorkarium@localhost:5432/lorkarium';
const S3 = {
  S3_ENDPOINT: 'http://localhost:8333',
  S3_REGION: 'sa-east-1',
  S3_BUCKET: 'lorkarium',
  S3_ACCESS_KEY_ID: 'lorkarium',
  S3_SECRET_ACCESS_KEY: 'lorkarium-dev-secret',
};
const REQUIRED = { DATABASE_URL, ...S3 };
const STORAGE = {
  endpoint: 'http://localhost:8333',
  region: 'sa-east-1',
  bucket: 'lorkarium',
  accessKeyId: 'lorkarium',
  secretAccessKey: 'lorkarium-dev-secret',
  forcePathStyle: true,
};

describe('readEnv', () => {
  it('only the database and S3 yield development on port 3333 without an admin seed', () => {
    expect(readEnv({ ...REQUIRED })).toEqual({
      nodeEnv: 'development',
      port: 3333,
      host: '0.0.0.0',
      databaseUrl: DATABASE_URL,
      database: { poolMax: 10, statementTimeoutMs: 5000, lockTimeoutMs: 2000 },
      adminSeed: null,
      storage: STORAGE,
    });
  });

  it('ADMIN_EMAIL with ADMIN_PASSWORD yields an admin seed with the e-mail normalized', () => {
    const env = readEnv({
      ...REQUIRED,
      ADMIN_EMAIL: '  Root@Lorkarium.DEV ',
      ADMIN_PASSWORD: 'twelve-chars',
    });
    expect(env.adminSeed).toEqual({ email: 'root@lorkarium.dev', password: 'twelve-chars' });
  });

  it.each([
    ['ADMIN_EMAIL alone', { ADMIN_EMAIL: 'root@lorkarium.dev' }, /ADMIN_PASSWORD/],
    ['ADMIN_PASSWORD alone', { ADMIN_PASSWORD: 'twelve-chars' }, /ADMIN_EMAIL/],
  ])('%s is refused naming the missing half', (_case, admin, missing) => {
    expect(() => readEnv({ ...REQUIRED, ...admin })).toThrow(missing);
  });

  it('in production an admin password of 11 characters is refused without echoing it', () => {
    const read = (): unknown =>
      readEnv({
        ...REQUIRED,
        NODE_ENV: 'production',
        ADMIN_EMAIL: 'root@lorkarium.dev',
        ADMIN_PASSWORD: 'eleven-char',
      });
    expect(read).toThrow(/ADMIN_PASSWORD/);
    expect(read).not.toThrow(/eleven-char/);
  });

  it.each(['development', 'test'])(
    'in %s a short admin password like "admin" is accepted',
    (nodeEnv) => {
      const env = readEnv({
        ...REQUIRED,
        NODE_ENV: nodeEnv,
        ADMIN_EMAIL: 'admin@admin.com',
        ADMIN_PASSWORD: 'admin',
      });
      expect(env.adminSeed).toEqual({ email: 'admin@admin.com', password: 'admin' });
    },
  );

  it('PORT=abc is refused citing the received value', () => {
    expect(() => readEnv({ ...REQUIRED, PORT: 'abc' })).toThrow(/PORT.*"abc"/);
  });
});

describe('readEnv, S3 storage', () => {
  it('without S3_REGION the region is us-east-1', () => {
    expect(readEnv({ ...REQUIRED, S3_REGION: undefined }).storage.region).toBe('us-east-1');
  });

  it('S3_FORCE_PATH_STYLE=false turns path-style addressing off', () => {
    const env = readEnv({ ...REQUIRED, S3_FORCE_PATH_STYLE: 'false' });
    expect(env.storage.forcePathStyle).toBe(false);
  });

  it('S3_FORCE_PATH_STYLE=sim is refused citing the value and true or false', () => {
    expect(() => readEnv({ ...REQUIRED, S3_FORCE_PATH_STYLE: 'sim' })).toThrow(
      /S3_FORCE_PATH_STYLE.*true or false.*"sim"/,
    );
  });

  it('an empty S3_BUCKET counts as absent and is refused naming the variable', () => {
    expect(() => readEnv({ ...REQUIRED, S3_BUCKET: '' })).toThrow(/S3_BUCKET.*received nothing/);
  });

  it('S3_ENDPOINT that is not a URL is refused citing the received value', () => {
    expect(() => readEnv({ ...REQUIRED, S3_ENDPOINT: 'nao-e-url' })).toThrow(
      /S3_ENDPOINT.*"nao-e-url"/,
    );
  });

  it('a short S3 secret key is refused without echoing it', () => {
    const read = (): unknown => readEnv({ ...REQUIRED, S3_SECRET_ACCESS_KEY: 'abc1234' });
    expect(read).toThrow(/S3_SECRET_ACCESS_KEY.*a redacted value/);
    expect(read).not.toThrow(/abc1234/);
  });
});

describe('readEnv, database pool and timeouts', () => {
  it('DATABASE_POOL_MAX, DATABASE_STATEMENT_TIMEOUT_MS and DATABASE_LOCK_TIMEOUT_MS are read as numbers', () => {
    const env = readEnv({
      ...REQUIRED,
      DATABASE_POOL_MAX: '20',
      DATABASE_STATEMENT_TIMEOUT_MS: '1500',
      DATABASE_LOCK_TIMEOUT_MS: '800',
    });
    expect(env.database).toEqual({ poolMax: 20, statementTimeoutMs: 1500, lockTimeoutMs: 800 });
  });

  it('DATABASE_POOL_MAX=abc is refused citing abc and an integer from 1 to 100', () => {
    expect(() => readEnv({ ...REQUIRED, DATABASE_POOL_MAX: 'abc' })).toThrow(
      'DATABASE_POOL_MAX must be an integer from 1 to 100 (received "abc")',
    );
  });

  it('DATABASE_POOL_MAX=0 is refused', () => {
    expect(() => readEnv({ ...REQUIRED, DATABASE_POOL_MAX: '0' })).toThrow(
      'DATABASE_POOL_MAX must be an integer from 1 to 100 (received "0")',
    );
  });

  it('a lock timeout of 0 (wait forever) is refused citing the value and the range', () => {
    expect(() => readEnv({ ...REQUIRED, DATABASE_LOCK_TIMEOUT_MS: '0' })).toThrow(
      'DATABASE_LOCK_TIMEOUT_MS must be an integer from 100 to 600000 milliseconds (received "0")',
    );
  });
});
