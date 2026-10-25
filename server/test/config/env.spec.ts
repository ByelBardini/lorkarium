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
const DATA_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
const REQUIRED = { DATABASE_URL, ...S3, DATA_ENCRYPTION_KEY };
const STORAGE = {
  endpoint: 'http://localhost:8333',
  region: 'sa-east-1',
  bucket: 'lorkarium',
  accessKeyId: 'lorkarium',
  secretAccessKey: 'lorkarium-dev-secret',
  forcePathStyle: true,
};

describe('readEnv', () => {
  it('only the database, S3 and the data key yield development on port 3333 without an admin seed', () => {
    expect(readEnv({ ...REQUIRED })).toEqual({
      nodeEnv: 'development',
      port: 3333,
      host: '0.0.0.0',
      databaseUrl: DATABASE_URL,
      database: { poolMax: 10, statementTimeoutMs: 5000, lockTimeoutMs: 2000 },
      adminSeed: null,
      storage: STORAGE,
      dataEncryptionKey: Buffer.alloc(32, 3),
      mailer: { kind: 'log', from: 'Lorkarium <no-reply@lorkarium.dev>' },
      appPublicUrl: 'http://localhost:5173',
      trustProxyHops: 0,
      clientDistDir: null,
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

describe('readEnv, DATA_ENCRYPTION_KEY', () => {
  it('absent is refused naming the variable and the expected 32 bytes', () => {
    expect(() => readEnv({ ...REQUIRED, DATA_ENCRYPTION_KEY: undefined })).toThrow(
      /DATA_ENCRYPTION_KEY is required; expected 32 bytes \(base64\) \(received nothing\)/,
    );
  });

  it('a key of 16 bytes is refused citing the size received, without echoing the key', () => {
    const short = Buffer.alloc(16, 1).toString('base64');
    const read = (): unknown => readEnv({ ...REQUIRED, DATA_ENCRYPTION_KEY: short });
    expect(read).toThrow(
      'DATA_ENCRYPTION_KEY decodes to 16 bytes; expected 32 bytes (base64) (received a redacted value)',
    );
    expect(read).not.toThrow(short);
  });

  it('a value that is not base64 is refused saying so', () => {
    expect(() => readEnv({ ...REQUIRED, DATA_ENCRYPTION_KEY: 'not base64!' })).toThrow(
      /DATA_ENCRYPTION_KEY is not base64; expected 32 bytes/,
    );
  });

  it('a valid key becomes the 32-byte buffer it encodes', () => {
    const key = Buffer.alloc(32, 5);
    const env = readEnv({ ...REQUIRED, DATA_ENCRYPTION_KEY: key.toString('base64') });
    expect(env.dataEncryptionKey).toEqual(key);
  });
});

describe('readEnv, mail', () => {
  const PRODUCTION = {
    ...REQUIRED,
    NODE_ENV: 'production',
    SMTP_URL: 'smtp://mailer:segredo-smtp@smtp.example.com:587',
    APP_PUBLIC_URL: 'https://mesa.example.com/',
  };

  it('in development without SMTP_URL the mail only goes to the log', () => {
    expect(readEnv({ ...REQUIRED, NODE_ENV: 'development' }).mailer).toEqual({
      kind: 'log',
      from: 'Lorkarium <no-reply@lorkarium.dev>',
    });
  });

  it('SMTP_URL and MAIL_FROM become an SMTP mailer', () => {
    const env = readEnv({
      ...REQUIRED,
      SMTP_URL: 'smtp://localhost:1025',
      MAIL_FROM: 'Mesa <mesa@example.com>',
    });
    expect(env.mailer).toEqual({
      kind: 'smtp',
      url: 'smtp://localhost:1025',
      from: 'Mesa <mesa@example.com>',
    });
  });

  it('production with SMTP_URL and APP_PUBLIC_URL boots, the trailing slash dropped from the URL', () => {
    const env = readEnv(PRODUCTION);
    expect(env.mailer.kind).toBe('smtp');
    expect(env.appPublicUrl).toBe('https://mesa.example.com');
  });

  it('production without SMTP_URL is refused naming the variable', () => {
    expect(() => readEnv({ ...PRODUCTION, SMTP_URL: undefined })).toThrow(
      /SMTP_URL is required in production \(received nothing\)/,
    );
  });

  it('production without APP_PUBLIC_URL is refused naming the variable', () => {
    expect(() => readEnv({ ...PRODUCTION, APP_PUBLIC_URL: undefined })).toThrow(
      /APP_PUBLIC_URL is required in production \(received nothing\)/,
    );
  });

  it('an SMTP_URL of another scheme is refused without echoing it (it carries the password)', () => {
    const url = 'http://mailer:segredo-smtp@smtp.example.com';
    const read = (): unknown => readEnv({ ...REQUIRED, SMTP_URL: url });
    expect(read).toThrow(
      /SMTP_URL must start with smtp:\/\/ or smtps:\/\/ \(received a redacted value\)/,
    );
    expect(read).not.toThrow(/segredo-smtp/);
  });
});

describe('readEnv, TRUST_PROXY', () => {
  it('absent means no proxy is trusted (0 hops)', () => {
    expect(readEnv({ ...REQUIRED }).trustProxyHops).toBe(0);
  });

  it.each([
    ['', 0],
    ['1', 1],
    ['5', 5],
  ])('TRUST_PROXY=%j is read as %i hops', (value, hops) => {
    expect(readEnv({ ...REQUIRED, TRUST_PROXY: value }).trustProxyHops).toBe(hops);
  });

  it.each(['true', '-1', '6'])(
    'TRUST_PROXY=%s is refused citing the value and the hop range',
    (value) => {
      expect(() => readEnv({ ...REQUIRED, TRUST_PROXY: value })).toThrow(
        new RegExp(`TRUST_PROXY must be an integer from 0 to 5.*"${value}"`),
      );
    },
  );
});

describe('readEnv, CLIENT_DIST_DIR', () => {
  it('absent means the server does not serve the client', () => {
    expect(readEnv({ ...REQUIRED }).clientDistDir).toBeNull();
  });

  it('an absolute path is the folder of the client build', () => {
    const env = readEnv({ ...REQUIRED, CLIENT_DIST_DIR: '/app/client/dist' });
    expect(env.clientDistDir).toBe('/app/client/dist');
  });

  it('a relative path is refused citing the value and an absolute path', () => {
    expect(() => readEnv({ ...REQUIRED, CLIENT_DIST_DIR: 'client/dist' })).toThrow(
      /CLIENT_DIST_DIR must be an absolute path.*"client\/dist"/,
    );
  });
});
