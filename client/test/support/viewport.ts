import { afterEach, beforeEach } from 'vitest';

type Viewport = 'mobile' | 'desktop';

const VIEWPORT_WIDTH_REM: Readonly<Record<Viewport, number>> = { mobile: 24, desktop: 80 };

/** jsdom has no `matchMedia`: installs, before each spec, one that answers as a phone or a
 *  desktop would, and removes it after. Only `(min-width: Nrem)` queries are understood. Call it in a
 *  `describe`, not inside an `it`.
 *
 *  Example: `describe('on a phone', () => { emulateViewport('mobile'); … })` */
export function emulateViewport(viewport: Viewport): void {
  const widthRem = VIEWPORT_WIDTH_REM[viewport];
  beforeEach(() => {
    window.matchMedia = (query: string): MediaQueryList => new MediaQueryListFake(query, widthRem);
  });
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia');
  });
}

/** Installs, before each spec, a `matchMedia` of a desktop whose system asks for less motion
 *  (`prefers-reduced-motion: reduce`), and removes it after. Call it in a `describe`.
 *
 *  Example: `describe('asking for less motion', () => { emulateReducedMotion(); … })` */
export function emulateReducedMotion(): void {
  beforeEach(() => {
    window.matchMedia = (query: string): MediaQueryList =>
      new MediaQueryListFake(query, VIEWPORT_WIDTH_REM.desktop, true);
  });
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia');
  });
}

class MediaQueryListFake extends EventTarget implements MediaQueryList {
  readonly matches: boolean;
  onchange: MediaQueryList['onchange'] = null;

  constructor(
    readonly media: string,
    widthRem: number,
    reducedMotion = false,
  ) {
    super();
    const minWidth = /min-width:\s*([\d.]+)rem/.exec(media)?.[1];
    const fits = minWidth !== undefined && widthRem >= Number(minWidth);
    this.matches = fits || (reducedMotion && media.includes('prefers-reduced-motion: reduce'));
  }

  addListener(): void {}

  removeListener(): void {}
}
