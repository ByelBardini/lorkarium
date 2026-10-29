type DomInterface = abstract new (...args: never[]) => unknown;

const RECOGNIZED = Symbol.for('lorkarium.crossWindowNodes');

/** Makes `x instanceof Node` (and every DOM interface under it: `Element`, `HTMLInputElement`…)
 *  of `home` also true for a node of another window of the same origin, by that window's own
 *  interface of the same name. Radix asks `target instanceof Node` with the main window's `Node`
 *  before dismissing a menu on an outside click; in the chat's own window every target is a node
 *  of another realm, so without this no menu, popover or dialog closed by clicking outside.
 *  Idempotent; the answer for the home window's own nodes never changes.
 *
 *  Example: `recognizeNodesOfOtherWindows(window)` */
export function recognizeNodesOfOtherWindows(home: Window & typeof globalThis): void {
  const node = home.Node;
  if (Object.hasOwn(node, RECOGNIZED)) return;
  Object.defineProperty(node, Symbol.hasInstance, {
    configurable: true,
    value: function isInstanceInAnyWindow(this: DomInterface, candidate: unknown): boolean {
      if (isOwnInstance(this, candidate)) return true;
      const twin = twinInterfaceOf(this, candidate, home);
      return twin !== null && isOwnInstance(twin, candidate);
    },
  });
  Object.defineProperty(node, RECOGNIZED, { value: true });
}

function isOwnInstance(type: DomInterface, candidate: unknown): boolean {
  return Function.prototype[Symbol.hasInstance].call(type, candidate);
}

function twinInterfaceOf(
  type: DomInterface,
  candidate: unknown,
  home: Window,
): DomInterface | null {
  const view = windowOf(candidate);
  if (!view || view === home) return null;
  const twin: unknown = Reflect.get(view, type.name);
  return typeof twin === 'function' ? (twin as DomInterface) : null;
}

function windowOf(candidate: unknown): Window | null {
  if (typeof candidate !== 'object' || candidate === null || !('nodeType' in candidate))
    return null;
  const node = candidate as Node;
  return (node.ownerDocument ?? (node as Document)).defaultView;
}
