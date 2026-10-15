import { hash, verify, type Algorithm, type Options } from '@node-rs/argon2';
import type { PasswordHasherPort } from '../../modules/auth/password-hasher.port';

// Algorithm.Argon2id; the enum is a `const enum`, unreachable under isolatedModules.
const ARGON2ID: Algorithm = 2;

// OWASP Password Storage Cheat Sheet minimum for Argon2id (spec §8.1).
const OWASP_ARGON2ID: Options = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

/** Argon2id over `@node-rs/argon2` (prebuilt binary, no node-gyp).
 *
 *  Example: `await new Argon2PasswordHasher().verify(row.passwordHash, body.password)` */
export class Argon2PasswordHasher implements PasswordHasherPort {
  hash(password: string): Promise<string> {
    return hash(password, OWASP_ARGON2ID);
  }

  verify(hashed: string, password: string): Promise<boolean> {
    return verify(hashed, password);
  }
}
