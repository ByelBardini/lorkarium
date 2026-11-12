import { describe, expect, it } from 'vitest';
import { byteSizeText } from '@/lib/byte-size-text';

describe('byteSizeText', () => {
  it('writes MB below 1 GiB', () => {
    expect(byteSizeText(40 * 1024 ** 2)).toBe('40 MB');
  });

  it('writes GB from 1 GiB up, with a decimal comma', () => {
    expect(byteSizeText(1.5 * 1024 ** 3)).toBe('1,5 GB');
  });

  it.each([
    [0, '0 MB'],
    [0.3 * 1024 ** 2, '0,3 MB'],
    [10 * 1024 ** 3, '10 GB'],
  ])('byteSizeText(%i) is %s', (bytes, text) => {
    expect(byteSizeText(bytes)).toBe(text);
  });

  it('refuses a negative size, naming it', () => {
    expect(() => byteSizeText(-1)).toThrow('got -1');
  });
});
