import type {
  ErrorReport,
  ErrorReportSink,
} from '../../src/modules/error-reports/error-report-sink.port';
import type { ClientErrorRelay } from '../../src/modules/error-reports/client-error-relay.port';
import type { ReportFailureLog } from '../../src/modules/error-reports/unexpected-errors.service';

/** Keeps every report it receives; `failing()` makes each capture throw. */
export class ErrorReportSinkFake implements ErrorReportSink {
  readonly reports: ErrorReport[] = [];
  flushes = 0;
  private failure: Error | null = null;

  failing(error = new Error('sentry down')): this {
    this.failure = error;
    return this;
  }

  capture(report: ErrorReport): void {
    if (this.failure) throw this.failure;
    this.reports.push(report);
  }

  flush(): Promise<boolean> {
    this.flushes += 1;
    return Promise.resolve(true);
  }
}

/** The warnings a report failure writes, in order. */
export class ReportFailureLogFake implements ReportFailureLog {
  readonly warnings: { fields: object; message: string }[] = [];

  warn(fields: object, message: string): void {
    this.warnings.push({ fields, message });
  }
}

/** Keeps every envelope it is asked to forward; `failing()` makes each forward reject. */
export class ClientErrorRelayFake implements ClientErrorRelay {
  readonly forwarded: string[] = [];
  private failure: Error | null = null;

  failing(error = new Error('Sentry ingest answered 500')): this {
    this.failure = error;
    return this;
  }

  forward(envelope: string): Promise<void> {
    if (this.failure) return Promise.reject(this.failure);
    this.forwarded.push(envelope);
    return Promise.resolve();
  }
}

/** Answers for the Sentry ingest: a status, or a fetch that never answers until aborted. */
export class IngestFetchFake {
  readonly calls: { url: string; init: RequestInit }[] = [];
  status = 200;
  hangs = false;

  readonly fetch = (url: string, init: RequestInit): Promise<Response> => {
    this.calls.push({ url, init });
    if (!this.hangs) return Promise.resolve(new Response(null, { status: this.status }));
    return new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    });
  };
}
