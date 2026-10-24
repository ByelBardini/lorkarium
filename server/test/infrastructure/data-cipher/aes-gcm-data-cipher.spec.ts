import { describe, expect, it } from 'vitest';
import { AesGcmDataCipher } from '../../../src/infrastructure/data-cipher/aes-gcm-data-cipher';

const KEY = Buffer.alloc(32, 7);
const OTHER_KEY = Buffer.alloc(32, 9);
const cipher = new AesGcmDataCipher(KEY);

function withByteFlipped(sealed: string): string {
  const [version, iv, body, tag] = sealed.split('.');
  const bytes = Buffer.from(body ?? '', 'base64url');
  bytes[0] = (bytes[0] ?? 0) ^ 0xff;
  return [version, iv, bytes.toString('base64url'), tag].join('.');
}

describe('AesGcmDataCipher', () => {
  it('opens what it sealed with the same purpose and context', () => {
    const sealed = cipher.seal('user-email', 'bia@x', 'u1');
    expect(cipher.open('user-email', sealed, 'u1')).toBe('bia@x');
  });

  it('two seals of the same text differ (random iv) and both start with v1.', () => {
    const first = cipher.seal('user-email', 'bia@x', 'u1');
    const second = cipher.seal('user-email', 'bia@x', 'u1');
    expect(first).not.toBe(second);
    expect(first).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(second.startsWith('v1.')).toBe(true);
  });

  it.each([
    [
      'another context',
      () => cipher.open('user-email', cipher.seal('user-email', 'bia@x', 'u1'), 'u2'),
    ],
    [
      'another purpose',
      () => cipher.open('pending-email', cipher.seal('user-email', 'bia@x', 'u1'), 'u1'),
    ],
    [
      'a flipped byte',
      () =>
        cipher.open('user-email', withByteFlipped(cipher.seal('user-email', 'bia@x', 'u1')), 'u1'),
    ],
    [
      'another key',
      () =>
        new AesGcmDataCipher(OTHER_KEY).open(
          'user-email',
          cipher.seal('user-email', 'bia@x', 'u1'),
          'u1',
        ),
    ],
  ])('with %s, open throws citing the purpose and never the text', (_, open) => {
    expect(open).toThrow(/cannot open a (user-email|pending-email) value/);
    expect(open).not.toThrow(/bia@x/);
  });

  it('a value of another version is refused citing it and expected v1', () => {
    const sealed = cipher.seal('totp-secret', 'JBSWY3DP', 'u1').replace(/^v1\./, 'v9.');
    expect(() => cipher.open('totp-secret', sealed, 'u1')).toThrow(/"v9".*expected v1/);
  });

  it('a value with missing parts is refused citing the expected shape', () => {
    expect(() => cipher.open('user-email', 'v1.abc', 'u1')).toThrow(/expected v1\.<iv>/);
  });

  it('the index is deterministic, 64 hex, and changes with the purpose and with the key', () => {
    const index = cipher.index('email-index', 'bia@x');
    expect(index).toMatch(/^[0-9a-f]{64}$/);
    expect(cipher.index('email-index', 'bia@x')).toBe(index);
    expect(cipher.index('recovery-code', 'bia@x')).not.toBe(index);
    expect(new AesGcmDataCipher(OTHER_KEY).index('email-index', 'bia@x')).not.toBe(index);
  });

  it('a master key that is not 32 bytes is refused citing its size', () => {
    expect(() => new AesGcmDataCipher(Buffer.alloc(16))).toThrow(/16 bytes; expected 32/);
  });
});
