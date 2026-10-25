import { describe, expect, it } from 'vitest';
import { gifFrameAt } from '@/renderer/gif-frame';

const TWO_FRAMES = [
  { start: 0, end: 100 },
  { start: 100, end: 300 },
];

describe('gifFrameAt', () => {
  it('250 ms in is the second frame (100 to 300)', () => {
    expect(gifFrameAt(TWO_FRAMES, 250)).toBe(1);
  });

  it('350 ms in loops back to the first frame', () => {
    expect(gifFrameAt(TWO_FRAMES, 350)).toBe(0);
  });

  it('the start is the first frame', () => {
    expect(gifFrameAt(TWO_FRAMES, 0)).toBe(0);
  });

  it('the end of a frame belongs to the next one', () => {
    expect(gifFrameAt(TWO_FRAMES, 100)).toBe(1);
  });

  it('no frames is refused, citing 0 frames', () => {
    expect(() => gifFrameAt([], 10)).toThrow(
      new RangeError('An animated image with 0 frames cannot play: expected at least 1 frame.'),
    );
  });
});
