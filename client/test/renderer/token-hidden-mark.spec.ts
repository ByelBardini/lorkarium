import { describe, expect, it } from 'vitest';
import { hiddenMarkOf } from '@/renderer/token-hidden-mark';

describe('hiddenMarkOf', () => {
  it('a 64 px token gets a badge of radius 12 on its top left corner, an eye and its slash', () => {
    expect(hiddenMarkOf({ width: 64, height: 64 })).toEqual({
      center: { x: 12, y: 12 },
      radius: 12,
      eye: { rx: 7.5, ry: 4.5 },
      pupil: 2.25,
      slash: [
        { x: 3, y: 3 },
        { x: 21, y: 21 },
      ],
    });
  });

  it('a stretched 128 x 64 token keeps the badge by its short side', () => {
    expect(hiddenMarkOf({ width: 128, height: 64 }).radius).toBe(12);
  });

  it('a half-cell token never gets a badge under 7 px, so the eye still reads', () => {
    expect(hiddenMarkOf({ width: 32, height: 32 }).radius).toBe(7);
  });
});
