import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64 } from '@/lib/base64';

describe('base64', () => {
  it('writes the bytes of a WOFF2 signature as standard base64, padded', () =>
    expect(bytesToBase64(new Uint8Array([0x77, 0x4f, 0x46, 0x32]))).toBe('d09GMg=='));

  it('reads base64 back into the same bytes', () =>
    expect([...base64ToBytes('d09GMg==')]).toEqual([0x77, 0x4f, 0x46, 0x32]));

  it('goes and comes back for every byte value and a file larger than one slice', () => {
    const bytes = Uint8Array.from({ length: 0x8000 * 2 + 7 }, (_, at) => at % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('no bytes is an empty text', () => expect(bytesToBase64(new Uint8Array())).toBe(''));
});
