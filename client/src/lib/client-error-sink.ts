import type { ClientErrorGate } from './client-error-gate';

/** Where a captured error came from: a route (loader, action, render), the React root, or the
 *  window (an uncaught error or rejection before the SDK took over). */
export type ClientErrorContext = Readonly<{
  source: 'route' | 'render' | 'window';
  /** The route pattern (`/campaigns/:campaignId`), never the URL with its ids and query. */
  routePattern?: string;
}>;

/** Takes an error already admitted by the gate. */
export interface ClientErrorSink {
  capture(error: unknown, context: ClientErrorContext): void;
}

type WindowErrors = Pick<Window, 'addEventListener' | 'removeEventListener'>;

export type BufferedClientErrorSink = Readonly<{
  sink: ClientErrorSink;
  /** Hands the buffer, in order, to the real sink; from then on it captures directly and the
   *  window listeners leave (the SDK's own handlers take over, without duplicates). */
  attach: (real: ClientErrorSink) => void;
}>;

/** The sink the app uses from its first line, while the SDK is still loading behind `import()`:
 *  what the gate admits waits in a buffer of `maxBuffered`.
 *
 *  Example: `const { sink, attach } = createBufferedClientErrorSink({ gate, maxBuffered: 10, scope: window })` */
export function createBufferedClientErrorSink(
  options: Readonly<{ gate: ClientErrorGate; maxBuffered: number; scope: WindowErrors }>,
): BufferedClientErrorSink {
  const buffered: [unknown, ClientErrorContext][] = [];
  let real: ClientErrorSink | null = null;
  const capture = (error: unknown, context: ClientErrorContext): void => {
    if (!options.gate.admits(error)) return;
    if (real) return real.capture(error, context);
    if (buffered.length < options.maxBuffered) buffered.push([error, context]);
  };
  const onError = (event: ErrorEvent): void => capture(event.error ?? event.message, WINDOW);
  const onRejection = (event: PromiseRejectionEvent): void => capture(event.reason, WINDOW);
  options.scope.addEventListener('error', onError);
  options.scope.addEventListener('unhandledrejection', onRejection);
  const attach = (sink: ClientErrorSink): void => {
    options.scope.removeEventListener('error', onError);
    options.scope.removeEventListener('unhandledrejection', onRejection);
    real = sink;
    for (const [error, context] of buffered.splice(0)) sink.capture(error, context);
  };
  return { sink: { capture }, attach };
}

const WINDOW: ClientErrorContext = { source: 'window' };
