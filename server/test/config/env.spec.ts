import { describe, expect, it } from 'vitest';
import { readEnv } from '../../src/config/env';

const DATABASE_URL = 'postgres://lorkarium:lorkarium@localhost:5432/lorkarium';

describe('readEnv', () => {
  it('only DATABASE_URL yields development on port 3333 without an admin seed', () => {
    expect(readEnv({ DATABASE_URL })).toEqual({
      nodeEnv: 'development',
      port: 3333,
      host: '0.0.0.0',
      databaseUrl: DATABASE_URL,
      adminSeed: null,
    });
  });

  it('ADMIN_EMAIL with ADMIN_PASSWORD yields an admin seed with the e-mail normalized', () => {
    const env = readEnv({
      DATABASE_URL,
      ADMIN_EMAIL: '  Root@Lorkarium.DEV ',
      ADMIN_PASSWORD: 'twelve-chars',
    });
    expect(env.adminSeed).toEqual({ email: 'root@lorkarium.dev', password: 'twelve-chars' });
  });

  it.each([
    ['ADMIN_EMAIL alone', { ADMIN_EMAIL: 'root@lorkarium.dev' }, /ADMIN_PASSWORD/],
    ['ADMIN_PASSWORD alone', { ADMIN_PASSWORD: 'twelve-chars' }, /ADMIN_EMAIL/],
  ])('%s is refused naming the missing half', (_case, admin, missing) => {
    expect(() => readEnv({ DATABASE_URL, ...admin })).toThrow(missing);
  });

  it('in production an admin password of 11 characters is refused without echoing it', () => {
    const read = (): unknown =>
      readEnv({
        DATABASE_URL,
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
        DATABASE_URL,
        NODE_ENV: nodeEnv,
        ADMIN_EMAIL: 'admin@admin.com',
        ADMIN_PASSWORD: 'admin',
      });
      expect(env.adminSeed).toEqual({ email: 'admin@admin.com', password: 'admin' });
    },
  );

  it('PORT=abc is refused citing the received value', () => {
    expect(() => readEnv({ DATABASE_URL, PORT: 'abc' })).toThrow(/PORT.*"abc"/);
  });
});
