import { describe, expect, it } from 'vitest';
import { imageFileProblem, imageOfClipboard } from '@/lib/image-file';

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
