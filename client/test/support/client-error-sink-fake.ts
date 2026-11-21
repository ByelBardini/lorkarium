import type { ClientErrorContext, ClientErrorSink } from '@/lib/client-error-sink';

/** Keeps what it captured, in order. */
export class ClientErrorSinkFake implements ClientErrorSink {
  readonly captured: [unknown, ClientErrorContext][] = [];

  capture(error: unknown, context: ClientErrorContext): void {
    this.captured.push([error, context]);
  }
}
