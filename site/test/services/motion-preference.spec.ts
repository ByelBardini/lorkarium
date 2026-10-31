import { describe, expect, it } from 'vitest';
import { MediaQueryMotionPreference } from '@/services/motion-preference';
import { MatchMediaFake } from '../support/match-media-fake';

describe('MediaQueryMotionPreference', () => {
  it('asks the browser for the reduced-motion media query', () => {
    const media = new MatchMediaFake(true);

    expect(new MediaQueryMotionPreference(media.matchMedia).prefersReduced()).toBe(true);
    expect(media.queries).toEqual(['(prefers-reduced-motion: reduce)']);
  });

  it('a visitor without the preference gets motion', () => {
    const media = new MatchMediaFake(false);

    expect(new MediaQueryMotionPreference(media.matchMedia).prefersReduced()).toBe(false);
  });

  // Regression: the default matchMedia lost its `this` and the browser threw "Illegal invocation",
  // stopping every motion script of the landing (site preview, 2026-10-31).
  it('calls the global matchMedia with the global object as this', () => {
    const original = globalThis.matchMedia;
    globalThis.matchMedia = function (this: unknown, query: string): MediaQueryList {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return { matches: query.includes('reduce') } as MediaQueryList;
    };
    try {
      expect(new MediaQueryMotionPreference().prefersReduced()).toBe(true);
    } finally {
      globalThis.matchMedia = original;
    }
  });

  it('a browser without matchMedia counts as no preference', () => {
    expect(new MediaQueryMotionPreference(undefined).prefersReduced()).toBe(false);
  });
});
