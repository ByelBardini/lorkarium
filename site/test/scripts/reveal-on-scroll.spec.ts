import { JSDOM } from 'jsdom';
import { beforeEach, describe, expect, it } from 'vitest';
import { startRevealOnScroll } from '@/scripts/reveal-on-scroll';
import { MotionPreferenceFake } from '../support/motion-preference-fake';
import { ViewportWatchFake } from '../support/viewport-watch-fake';

const ACTS_HTML =
  '<section id="ato-1" data-reveal></section><section id="ato-2" data-reveal></section>';

let document: Document;

function act(id: string): Element {
  const element = document.getElementById(id);
  if (!element) throw new Error(`#${id} is missing: expected one of ${ACTS_HTML}`);
  return element;
}

function revealedIds(): string[] {
  return [...document.querySelectorAll('[data-revealed]')].map((element) => element.id);
}

describe('startRevealOnScroll', () => {
  beforeEach(() => {
    document = new JSDOM(ACTS_HTML).window.document;
  });

  it('with motion, a marked element is revealed only once it enters the viewport', () => {
    const watch = new ViewportWatchFake();
    startRevealOnScroll(document, { watch, motion: new MotionPreferenceFake() });

    expect(document.documentElement.hasAttribute('data-motion')).toBe(true);
    expect(revealedIds()).toEqual([]);
    watch.enter(act('ato-2'));

    expect(revealedIds()).toEqual(['ato-2']);
  });

  it('a revealed element stops being watched while the others stay watched', () => {
    const watch = new ViewportWatchFake();
    startRevealOnScroll(document, { watch, motion: new MotionPreferenceFake() });

    watch.enter(act('ato-1'));

    expect(watch.watched).toEqual([act('ato-2')]);
  });

  it('leaving the viewport before entering keeps the element hidden', () => {
    const watch = new ViewportWatchFake();
    startRevealOnScroll(document, { watch, motion: new MotionPreferenceFake() });

    watch.leave(act('ato-1'));

    expect(revealedIds()).toEqual([]);
  });

  it('with reduced motion everything is revealed at once and nothing is watched', () => {
    const watch = new ViewportWatchFake();
    startRevealOnScroll(document, { watch, motion: new MotionPreferenceFake().reduce() });

    expect(revealedIds()).toEqual(['ato-1', 'ato-2']);
    expect(watch.watched).toEqual([]);
    expect(document.documentElement.hasAttribute('data-motion')).toBe(false);
  });

  it('a browser without IntersectionObserver reveals everything, never hiding the page', () => {
    startRevealOnScroll(document, { watch: null, motion: new MotionPreferenceFake() });

    expect(revealedIds()).toEqual(['ato-1', 'ato-2']);
    expect(document.documentElement.hasAttribute('data-motion')).toBe(false);
  });

  it('a page without marked elements watches nothing', () => {
    document = new JSDOM('<section id="ato-1"></section>').window.document;
    const watch = new ViewportWatchFake();

    startRevealOnScroll(document, { watch, motion: new MotionPreferenceFake() });

    expect(watch.watched).toEqual([]);
  });
});
