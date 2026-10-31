import type { ViewportWatch } from '@/services/viewport-watch';

/** Watch moved by hand: `enter`/`leave` play what the `IntersectionObserver` would report. */
export class ViewportWatchFake implements ViewportWatch {
  private readonly listeners = new Map<Element, (inView: boolean) => void>();

  get watched(): Element[] {
    return [...this.listeners.keys()];
  }

  observe(element: Element, onChange: (inView: boolean) => void): void {
    this.listeners.set(element, onChange);
  }

  unobserve(element: Element): void {
    this.listeners.delete(element);
  }

  enter(element: Element): void {
    this.listenerOf(element)(true);
  }

  leave(element: Element): void {
    this.listenerOf(element)(false);
  }

  private listenerOf(element: Element): (inView: boolean) => void {
    const listener = this.listeners.get(element);
    if (listener) return listener;
    throw new Error(`<${element.localName}> is not watched: expected an observed element`);
  }
}
