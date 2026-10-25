import type { PublishedBuild } from '@/services/published-build';

/** The build the server publishes, set by hand: `publish(fingerprint)` is what the next asks
 *  answer (`null` plays the server unreachable); `asks` counts them. */
export class PublishedBuildFake implements PublishedBuild {
  asks = 0;
  private current: string | null;

  constructor(initial: string | null) {
    this.current = initial;
  }

  publish(fingerprint: string | null): void {
    this.current = fingerprint;
  }

  fingerprint(): Promise<string | null> {
    this.asks += 1;
    return Promise.resolve(this.current);
  }
}

/** `location.reload()`, counted instead of done (jsdom does not reload). */
export class PageReloadFake {
  count = 0;

  readonly reload = (): void => {
    this.count += 1;
  };
}
