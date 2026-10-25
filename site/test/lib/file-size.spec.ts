import { describe, expect, it } from 'vitest';
import { fileSizeLabel } from '@/lib/file-size';

describe('fileSizeLabel', () => {
  it.each([
    [8_808_038, '8,4 MB'],
    [999, '1 KB'],
    [0, '0 KB'],
    [1, '1 KB'],
    [1024, '1 KB'],
    [1025, '2 KB'],
  ])('%i bytes reads %s', (bytes, label) => {
    expect(fileSizeLabel(bytes)).toBe(label);
  });

  it('just under 1000 KB still reads in KB', () => {
    expect(fileSizeLabel(999 * 1024)).toBe('999 KB');
  });

  it('from 1000 KB on it switches to MB with one decimal', () => {
    expect(fileSizeLabel(999 * 1024 + 1)).toBe('1,0 MB');
  });

  it('large sizes group thousands the pt-BR way', () => {
    expect(fileSizeLabel(1536 * 1024 * 1024)).toBe('1.536,0 MB');
  });
});
