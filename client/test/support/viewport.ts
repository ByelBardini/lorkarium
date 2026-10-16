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

class MediaQueryListFake extends EventTarget implements MediaQueryList {
  readonly matches: boolean;
  onchange: MediaQueryList['onchange'] = null;

  constructor(
    readonly media: string,
    widthRem: number,
  ) {
    super();
    const minWidth = /min-width:\s*([\d.]+)rem/.exec(media)?.[1];
    this.matches = minWidth !== undefined && widthRem >= Number(minWidth);
  }

  addListener(): void {}

  removeListener(): void {}
}
