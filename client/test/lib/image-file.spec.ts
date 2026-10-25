import { describe, expect, it } from 'vitest';
import { animatesImage, imageAcceptOf, imageFileProblem, imageOfClipboard } from '@/lib/image-file';

const MB = 1024 * 1024;

function fileOf(type: string, size = 1 * MB): File {
  return new File([new Uint8Array(size)], 'imagem', { type });
}

describe('imageFileProblem', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp'])('a %s of 1 MB can go', (type) => {
    expect(imageFileProblem(fileOf(type))).toBeNull();
  });

  it('a GIF is refused asking for PNG, JPEG or WebP', () => {
    expect(imageFileProblem(fileOf('image/gif'))).toBe('Use PNG, JPEG ou WebP.');
  });

  it('a GIF for a place that animates (the aura) can go', () => {
    expect(imageFileProblem(fileOf('image/gif'), { animated: true })).toBeNull();
  });

  it('an SVG for the aura is refused asking for PNG, JPEG, WebP or GIF', () => {
    expect(imageFileProblem(fileOf('image/svg+xml'), { animated: true })).toBe(
      'Use PNG, JPEG, WebP ou GIF.',
    );
  });

  it('a GIF of 20 MB and one byte for the aura is refused for passing 20 MB', () => {
    const file = { type: 'image/gif', size: 20 * MB + 1 };

    expect(imageFileProblem(file, { animated: true })).toBe('A imagem passa de 20 MB.');
  });

  it('a PNG of 25 MB is refused for passing 20 MB', () => {
    expect(imageFileProblem({ type: 'image/png', size: 25 * MB })).toBe('A imagem passa de 20 MB.');
  });

  it('exactly 20 MB still goes', () => {
    expect(imageFileProblem({ type: 'image/png', size: 20 * MB })).toBeNull();
  });
});

describe('imageOfClipboard', () => {
  it('the first image of a paste is taken, skipping a text file before it', () => {
    const png = fileOf('image/png');
    const files = [fileOf('text/plain'), png];

    expect(imageOfClipboard({ files: files as unknown as FileList })).toBe(png);
  });

  it('a paste without any image gives nothing', () => {
    const files = [fileOf('text/plain')];

    expect(imageOfClipboard({ files: files as unknown as FileList })).toBeNull();
    expect(imageOfClipboard(null)).toBeNull();
  });
});

describe('imageAcceptOf', () => {
  it('a still place offers PNG, JPEG and WebP in the file dialog, never GIF', () => {
    expect(imageAcceptOf({ animated: false })).toBe('image/png,image/jpeg,image/webp');
  });

  it('the aura also offers GIF in the file dialog', () => {
    expect(imageAcceptOf({ animated: true })).toBe('image/png,image/jpeg,image/webp,image/gif');
  });
});

describe('animatesImage', () => {
  it('the aura keeps the image animated', () => {
    expect(animatesImage('aura')).toBe(true);
  });

  it.each(['token', 'background', 'cover', 'condition'] as const)(
    'a %s image stays still',
    (purpose) => {
      expect(animatesImage(purpose)).toBe(false);
    },
  );
});
