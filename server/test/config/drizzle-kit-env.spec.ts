import { afterEach, describe, expect, it, vi } from 'vitest';
import { readDrizzleKitCredentials } from '../../src/config/drizzle-kit-env';

describe('readDrizzleKitCredentials', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('an exported DATABASE_URL becomes the drizzle-kit credentials', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://lorkarium:lorkarium@localhost:5434/lorkarium');
    expect(readDrizzleKitCredentials()).toEqual({
      dbCredentials: { url: 'postgres://lorkarium:lorkarium@localhost:5434/lorkarium' },
    });
  });

  it('an empty DATABASE_URL yields no credentials, so generate still runs without a database', () => {
    vi.stubEnv('DATABASE_URL', '');
    expect(readDrizzleKitCredentials()).toEqual({});
  });
});
