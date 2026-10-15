import { describe, expect, it } from 'vitest';
import { CryptoSessionToken } from '../../../src/infrastructure/session-token/crypto-session-token';

describe('CryptoSessionToken', () => {
  const tokens = new CryptoSessionToken();

  it('generates a base64url token carrying at least 20 random bytes', () => {
    const token = tokens.generate();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, 'base64url').length).toBeGreaterThanOrEqual(20);
  });

  it('two generated tokens differ', () => {
    expect(tokens.generate()).not.toBe(tokens.generate());
  });

  it('hashes a token to its SHA-256 in lowercase hex', () => {
    expect(tokens.hash('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
