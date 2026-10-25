import { describe, expect, it } from 'vitest';
import { isGifBytes } from '@/renderer/aura-image-kind';

function bytesOf(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

describe('isGifBytes', () => {
  it.each(['GIF89a', 'GIF87a'])('a file starting with %s is a GIF', (signature) => {
    expect(isGifBytes(bytesOf(`${signature}\x01\x00\x01\x00`))).toBe(true);
  });

  it('a PNG is not a GIF, whatever the url says', () => {
    expect(isGifBytes(bytesOf('\x89PNG\r\n\x1a\n'))).toBe(false);
  });

  it('fewer than 6 bytes are not a GIF', () => {
    expect(isGifBytes(bytesOf('GIF89'))).toBe(false);
  });

  it('GIF88a is no GIF version', () => {
    expect(isGifBytes(bytesOf('GIF88a\x01\x00'))).toBe(false);
  });
});
