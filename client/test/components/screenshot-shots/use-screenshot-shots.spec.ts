import { describe, expect, it } from 'vitest';
import { screenshotRefusalOf } from '@/components/screenshot-shots/use-screenshot-shots';

const FIVE_MIB = 5 * 1024 * 1024;
const LIMIT_TEXT = 'Até 5 prints por denúncia.';

function file(type: string, size: number): File {
  return new File([new Uint8Array(size)], 'print', { type });
}

describe('screenshotRefusalOf', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp'])(
    'a %s of exactly 5 MiB joins 4 others',
    (type) => {
      expect(screenshotRefusalOf(file(type, FIVE_MIB), 4, LIMIT_TEXT)).toBeNull();
    },
  );

  it('a 6th screenshot is refused with the limit sentence it was given, whatever the file', () => {
    expect(screenshotRefusalOf(file('image/png', 10), 5, LIMIT_TEXT)).toBe(LIMIT_TEXT);
    expect(screenshotRefusalOf(file('image/png', 10), 5, 'Até 5 prints por relato.')).toBe(
      'Até 5 prints por relato.',
    );
  });

  it.each(['image/gif', 'image/svg+xml', ''])(
    'a file of type "%s" is refused naming the accepted types',
    (type) => {
      expect(screenshotRefusalOf(file(type, 10), 0, LIMIT_TEXT)).toBe(
        'Envie um PNG, JPEG ou WebP.',
      );
    },
  );

  it('one byte past 5 MiB is refused with the size', () => {
    expect(screenshotRefusalOf(file('image/png', FIVE_MIB + 1), 0, LIMIT_TEXT)).toBe(
      'O print passa de 5 MB.',
    );
  });
});
