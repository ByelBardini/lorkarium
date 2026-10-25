import { describe, expect, it } from 'vitest';
import { auraFrameDue, auraMotionOf, auraOnScreen } from '@/renderer/aura-motion';

const SCREEN = { x: 0, y: 0, width: 800, height: 600 };

describe('auraFrameDue', () => {
  it('20 ms after the last step is too soon at 30 frames per second', () => {
    expect(auraFrameDue(0, 20)).toBe(false);
  });

  it('34 ms after the last step is the next frame', () => {
    expect(auraFrameDue(0, 34)).toBe(true);
  });
});

describe('auraMotionOf', () => {
  it('on and without reduced motion, the auras play', () => {
    expect(auraMotionOf({ enabled: true, reducedMotion: false })).toBe('playing');
  });

  it('reduced motion stills them even when "Animar auras" is on', () => {
    expect(auraMotionOf({ enabled: true, reducedMotion: true })).toBe('still');
  });

  it('"Animar auras" off stills them', () => {
    expect(auraMotionOf({ enabled: false, reducedMotion: false })).toBe('still');
  });
});

describe('auraOnScreen', () => {
  it('an aura past the right edge of the view is off screen', () => {
    expect(auraOnScreen({ x: 900, y: 10, width: 64, height: 64 }, SCREEN)).toBe(false);
  });

  it('an aura that only crosses the edge is on screen', () => {
    expect(auraOnScreen({ x: 780, y: -30, width: 64, height: 64 }, SCREEN)).toBe(true);
  });

  it('an aura touching the edge without crossing it is off screen', () => {
    expect(auraOnScreen({ x: 800, y: 0, width: 64, height: 64 }, SCREEN)).toBe(false);
  });
});
