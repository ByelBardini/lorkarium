import type { UnexpectedError } from './unexpected-error.mapper';

/** An unexpected error the throttle let through: its fingerprint and how many of the same were
 *  silenced since the previous one. */
export type ErrorReport = UnexpectedError & Readonly<{ fingerprint: string; suppressed: number }>;

/** Where the reports of the server go (Sentry in production, nowhere without a DSN). `capture`
 *  never waits for the network; `flush` drains what is queued, before the process exits. */
export interface ErrorReportSink {
  capture(report: ErrorReport): void;
  /** Resolves `false` when the queue did not drain within `timeoutMs`. */
  flush(timeoutMs: number): Promise<boolean>;
}
