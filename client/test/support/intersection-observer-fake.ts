/** The browser's IntersectionObserver without layout (jsdom has none): every observer is kept in
 *  `instances`, and `scrollIntoView(target)` tells the ones watching `target` that it came into
 *  view. Install it with `vi.stubGlobal('IntersectionObserver', IntersectionObserverFake)`.
 *
 *  Example: `IntersectionObserverFake.scrollIntoView(screen.getByTestId('icon-grid-end'))` */
export class IntersectionObserverFake {
  static instances: IntersectionObserverFake[] = [];
  private readonly targets = new Set<Element>();

  constructor(private readonly callback: IntersectionObserverCallback) {
    IntersectionObserverFake.instances.push(this);
  }

  static reset(): void {
    IntersectionObserverFake.instances = [];
  }

  static scrollIntoView(target: Element): void {
    for (const observer of IntersectionObserverFake.instances) observer.reach(target);
  }

  observe(target: Element): void {
    this.targets.add(target);
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }

  disconnect(): void {
    this.targets.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  private reach(target: Element): void {
    if (!this.targets.has(target)) return;
    const entry = { target, isIntersecting: true } as IntersectionObserverEntry;
    this.callback([entry], this as unknown as IntersectionObserver);
  }
}
