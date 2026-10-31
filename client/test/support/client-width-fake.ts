/** jsdom has no layout: gives every element the `clientWidth` read by `width()` and returns the
 *  undo, which falls back to jsdom's own 0.
 *
 *  Example: `const restore = fakeClientWidth(() => 300); … restore();` */
export function fakeClientWidth(width: () => number): () => void {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: width });
  return () => {
    Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
  };
}
