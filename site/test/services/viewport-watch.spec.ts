import { JSDOM } from 'jsdom';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  BrowserViewportWatch,
  browserViewportWatch,
  type IntersectionObserverConstructor,
} from '@/services/viewport-watch';
import { IntersectionObserverFake } from '../support/intersection-observer-fake';

const Observer = IntersectionObserverFake as unknown as IntersectionObserverConstructor;
const { document } = new JSDOM('<section id="a"></section><section id="b"></section>').window;
const first = document.querySelector('#a') as Element;
const second = document.querySelector('#b') as Element;

function onlyObserver(): IntersectionObserverFake {
  const [observer] = IntersectionObserverFake.created;
  if (!observer) throw new Error('no IntersectionObserver was created: expected one');
  return observer;
}

describe('BrowserViewportWatch', () => {
  beforeEach(() => {
    IntersectionObserverFake.created = [];
  });

  it('creates no browser observer until something is observed', () => {
    new BrowserViewportWatch(Observer);

    expect(IntersectionObserverFake.created).toHaveLength(0);
  });

  it('reports to each element its own entering and leaving', () => {
    const seen: string[] = [];
    const watch = new BrowserViewportWatch(Observer, { rootMargin: '0px 0px -12% 0px' });
    watch.observe(first, (inView) => seen.push(`a:${inView}`));
    watch.observe(second, (inView) => seen.push(`b:${inView}`));

    onlyObserver().report(second, true);
    onlyObserver().report(first, false);

    expect(seen).toEqual(['b:true', 'a:false']);
    expect(onlyObserver().options).toEqual({ rootMargin: '0px 0px -12% 0px' });
  });

  it('an unobserved element is no longer watched nor reported', () => {
    const seen: boolean[] = [];
    const watch = new BrowserViewportWatch(Observer);
    watch.observe(first, (inView) => seen.push(inView));

    watch.unobserve(first);
    onlyObserver().report(first, true);

    expect(onlyObserver().observed.has(first)).toBe(false);
    expect(seen).toEqual([]);
  });
});

describe('browserViewportWatch', () => {
  it('is null in a browser without IntersectionObserver', () => {
    expect(browserViewportWatch({})).toBeNull();
  });

  it('is a working watch when the browser has IntersectionObserver', () => {
    IntersectionObserverFake.created = [];
    const watch = browserViewportWatch({ IntersectionObserver: Observer });

    watch?.observe(first, () => undefined);

    expect(onlyObserver().observed.has(first)).toBe(true);
  });
});
