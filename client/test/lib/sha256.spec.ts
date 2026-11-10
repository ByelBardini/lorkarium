import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Base64, sha256Bytes } from '@/lib/sha256';

function hexOf(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexOfText(text: string): string {
  return hexOf(sha256Bytes(new TextEncoder().encode(text)));
}

function nodeBase64Of(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('base64');
}

describe('sha256Bytes against the NIST vectors (FIPS 180-4 examples)', () => {
  it('the empty message', () =>
    expect(hexOfText('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'));

  it('"abc", one block', () =>
    expect(hexOfText('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    ));

  it('the 448-bit message, whose padding needs a second block', () =>
    expect(hexOfText('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ));

  it('one million "a"', () =>
    expect(hexOfText('a'.repeat(1_000_000))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    ));

  it('always gives 32 bytes', () => expect(sha256Bytes(new Uint8Array(3))).toHaveLength(32));
});

describe('sha256Base64', () => {
  it('writes the digest of "abc" as padded standard base64', () =>
    expect(sha256Base64('abc')).toBe('ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0='));

  it.each([
    'ação, maçã e coração',
    'dados 🎲🐉 e ficha',
    '\n// um script\nlorkarium.ready();',
    '� no lugar do nulo',
  ])('hashes the UTF-8 bytes of %j as node:crypto does', (text) =>
    expect(sha256Base64(text)).toBe(nodeBase64Of(text)),
  );

  it.each([55, 56, 63, 64, 65, 119, 120, 128])(
    'agrees with node:crypto at %i bytes, around the padding boundaries',
    (length) => {
      const text = 'x'.repeat(length);
      expect(sha256Base64(text)).toBe(nodeBase64Of(text));
    },
  );

  it('agrees with node:crypto when a multi-byte character crosses the block boundary', () => {
    const text = `${'a'.repeat(62)}é🎲${'b'.repeat(70)}`;
    expect(sha256Base64(text)).toBe(nodeBase64Of(text));
  });

  it('encodes a lone surrogate as U+FFFD, as the browser does before hashing', () =>
    expect(sha256Base64('a\uD800b')).toBe(nodeBase64Of('a�b')));
});
