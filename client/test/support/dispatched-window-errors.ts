import { afterEach, beforeEach } from 'vitest';

// Vitest's jsdom turns every window `ErrorEvent` into an uncaught exception (failing the run) while
// no `error` listener was added through `addEventListener`; the Sentry SDK listens by
// `window.onerror` and the buffered sink removes its own, so the specs that dispatch one on
// purpose register this no-op listener to tell Vitest the error is expected.
const expectWindowError = (): void => undefined;

/** Lets a spec dispatch `ErrorEvent`s on `window` without Vitest reporting them as unhandled.
 *
 *  Example: `describe('x', () => { allowDispatchedWindowErrors(); it(...) })` */
export function allowDispatchedWindowErrors(): void {
  beforeEach(() => {
    window.addEventListener('error', expectWindowError);
  });
  afterEach(() => {
    window.removeEventListener('error', expectWindowError);
  });
}
