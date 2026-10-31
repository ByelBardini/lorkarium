/** Port that tells when an element enters or leaves the viewport. */
export interface ViewportWatch {
  observe(element: Element, onChange: (inView: boolean) => void): void;
  unobserve(element: Element): void;
}

export type IntersectionObserverConstructor = new (
  callback: IntersectionObserverCallback,
  options?: IntersectionObserverInit,
) => IntersectionObserver;

/** `ViewportWatch` over one `IntersectionObserver`, created only on the first `observe`. */
export class BrowserViewportWatch implements ViewportWatch {
  private readonly listeners = new Map<Element, (inView: boolean) => void>();
  private observer: IntersectionObserver | null = null;

  constructor(
    private readonly Observer: IntersectionObserverConstructor,
    private readonly options: IntersectionObserverInit = {},
  ) {}

  /**
   * Calls `onChange(true)` on entering the viewport and `onChange(false)` on leaving it.
   * Example: `watch.observe(tracker, (inView) => (visible = inView))`
   */
  observe(element: Element, onChange: (inView: boolean) => void): void {
    this.listeners.set(element, onChange);
    this.observerOf().observe(element);
  }

  /**
   * Stops reporting the element.
   * Example: `watch.unobserve(revealedSection)`
   */
  unobserve(element: Element): void {
    this.listeners.delete(element);
    this.observer?.unobserve(element);
  }

  private observerOf(): IntersectionObserver {
    this.observer ??= new this.Observer((entries) => this.report(entries), this.options);
    return this.observer;
  }

  private report(entries: readonly IntersectionObserverEntry[]): void {
    for (const entry of entries) this.listeners.get(entry.target)?.(entry.isIntersecting);
  }
}

/**
 * The browser watch, or null when the browser has no `IntersectionObserver`.
 * Example: `browserViewportWatch(window, { rootMargin: REVEAL_ROOT_MARGIN })`
 */
export function browserViewportWatch(
  scope: { IntersectionObserver?: IntersectionObserverConstructor },
  options: IntersectionObserverInit = {},
): ViewportWatch | null {
  if (scope.IntersectionObserver === undefined) return null;
  return new BrowserViewportWatch(scope.IntersectionObserver, options);
}
