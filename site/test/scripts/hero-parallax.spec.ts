import { JSDOM, type DOMWindow } from 'jsdom';
import { beforeEach, describe, expect, it } from 'vitest';
import { startHeroParallax, type ParallaxViewport } from '@/scripts/hero-parallax';
import { FrameSchedulerFake } from '../support/frame-scheduler-fake';
import { MotionPreferenceFake } from '../support/motion-preference-fake';
import { ViewportWatchFake } from '../support/viewport-watch-fake';

const HERO_HTML = `<section id="topo">
  <svg><g id="mapa" data-parallax-depth="0.5"></g></svg>
  <div id="tokens" data-parallax-depth="1"></div>
</section>`;

let window: DOMWindow;
let frames: FrameSchedulerFake;
let watch: ViewportWatchFake;

function hero(): Element {
  const section = window.document.querySelector('section#topo');
  if (!section) throw new Error('section#topo is missing: expected the hero of HERO_HTML');
  return section;
}

function transformOf(id: string): string | undefined {
  return window.document.querySelector<HTMLElement>(`#${id}`)?.style.transform;
}

function scrollTo(scrollY: number, events = 1): void {
  Object.defineProperty(window, 'scrollY', { value: scrollY, configurable: true });
  for (let event = 0; event < events; event += 1) window.dispatchEvent(new window.Event('scroll'));
}

function start(motion = new MotionPreferenceFake(), viewport: ParallaxViewport = window): void {
  startHeroParallax(window.document, { viewport, frames, watch, motion });
}

describe('startHeroParallax', () => {
  beforeEach(() => {
    window = new JSDOM(HERO_HTML).window;
    frames = new FrameSchedulerFake();
    watch = new ViewportWatchFake();
  });

  it('a burst of 10 scroll events applies one transform per frame', () => {
    start();
    watch.enter(hero());
    frames.flush();

    scrollTo(300, 10);

    expect(frames.pending).toBe(1);
    frames.flush();
    expect(transformOf('mapa')).toBe('translate3d(0px, 150px, 0px)');
    expect(transformOf('tokens')).toBe('translate3d(0px, 300px, 0px)');
  });

  it('the pointer at the right edge shifts the deepest layer 24 px to the left', () => {
    start();
    watch.enter(hero());

    hero().dispatchEvent(new window.MouseEvent('pointermove', { clientX: 1024, clientY: 0 }));
    frames.flush();

    expect(transformOf('tokens')).toBe('translate3d(-24px, 0px, 0px)');
    expect(transformOf('mapa')).toBe('translate3d(-12px, 0px, 0px)');
  });

  it('with the hero off screen no frame is scheduled until it comes back', () => {
    start();
    watch.enter(hero());
    frames.flush();
    watch.leave(hero());

    scrollTo(2_000, 3);
    expect(frames.pending).toBe(0);
    watch.enter(hero());
    expect(frames.pending).toBe(1);
  });

  it('listens to scroll and pointer passively', () => {
    const passive: Array<[string, boolean | undefined]> = [];
    const viewport: ParallaxViewport = {
      scrollY: 0,
      innerWidth: 1024,
      innerHeight: 768,
      addEventListener: (type, _listener, options) => passive.push([type, options.passive]),
    };
    const addToHero = hero().addEventListener.bind(hero());
    hero().addEventListener = (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ): void => {
      passive.push([type, typeof options === 'object' ? options.passive : undefined]);
      addToHero(type, listener, options);
    };

    start(new MotionPreferenceFake(), viewport);

    expect(passive).toEqual([
      ['scroll', true],
      ['pointermove', true],
    ]);
  });

  it('with reduced motion nothing listens, nothing is watched and no layer moves', () => {
    start(new MotionPreferenceFake().reduce());

    scrollTo(300, 3);

    expect(frames.pending).toBe(0);
    expect(watch.watched).toEqual([]);
    expect(transformOf('tokens')).toBe('');
  });

  it('a browser without IntersectionObserver keeps the parallax always on', () => {
    startHeroParallax(window.document, {
      viewport: window,
      frames,
      watch: null,
      motion: new MotionPreferenceFake(),
    });
    frames.flush();

    scrollTo(100);
    frames.flush();

    expect(transformOf('tokens')).toBe('translate3d(0px, 100px, 0px)');
  });
});
