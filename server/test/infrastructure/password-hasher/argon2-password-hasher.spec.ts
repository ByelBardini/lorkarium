import { describe, expect, it } from 'vitest';
import { Argon2PasswordHasher } from '../../../src/infrastructure/password-hasher/argon2-password-hasher';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('hashes with Argon2id at the OWASP minimum of 19 MiB, t=2, p=1', async () => {
    const hashed = await hasher.hash('correct horse battery staple');
    expect(hashed).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('verifies the password that produced the hash', async () => {
    const hashed = await hasher.hash('correct horse battery staple');
    expect(await hasher.verify(hashed, 'correct horse battery staple')).toBe(true);
  });

  it('refuses a different password against the same hash', async () => {
    const hashed = await hasher.hash('correct horse battery staple');
    expect(await hasher.verify(hashed, 'Correct horse battery staple')).toBe(false);
  });
});
