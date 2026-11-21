import type { ClockPort } from '../auth/clock.port';
import type { ErrorReportThrottleBo } from './error-report-throttle.bo';
import type { ErrorReportSink } from './error-report-sink.port';
import { errorFingerprintOf, unexpectedErrorOf } from './unexpected-error.mapper';

/** The `warn` of the logger the error came through: a failed report is an expected failure,
 *  never an `error`, or a Sentry outage would report about itself. */
export type ReportFailureLog = Readonly<{ warn: (fields: object, message: string) => void }>;

export type UnexpectedErrorsDeps = Readonly<{
  sink: ErrorReportSink;
  clock: ClockPort;
  throttle: ErrorReportThrottleBo;
}>;

/** Turns every `log.error`/`log.fatal` of the app into a report, through the throttle.
 *
 *  Example: `service.onErrorLog([{ err }, 'unexpected error in the auth module'], bindings, log)` */
export class UnexpectedErrorsService {
  private reporting = false;

  constructor(private readonly deps: UnexpectedErrorsDeps) {}

  /** Never throws: the log line it came from is written whatever happens here. */
  onErrorLog(
    args: readonly unknown[],
    bindings: Readonly<Record<string, unknown>>,
    log: ReportFailureLog,
  ): void {
    // A sink that logs an error while capturing would come back here.
    if (this.reporting) return;
    this.reporting = true;
    try {
      this.report(args, bindings);
    } catch (error) {
      log.warn({ err: error }, 'error report not sent: the error report sink failed');
    } finally {
      this.reporting = false;
    }
  }

  private report(args: readonly unknown[], bindings: Readonly<Record<string, unknown>>): void {
    const unexpected = unexpectedErrorOf(args, bindings);
    const fingerprint = errorFingerprintOf(unexpected);
    const verdict = this.deps.throttle.admits(fingerprint, this.deps.clock.now().getTime());
    if (!verdict.admitted) return;
    this.deps.sink.capture({ ...unexpected, fingerprint, suppressed: verdict.suppressed });
  }
}
