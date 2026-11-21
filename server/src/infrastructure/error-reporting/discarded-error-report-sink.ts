import type { ErrorReportSink } from '../../modules/error-reports/error-report-sink.port';

/** The sink without `SENTRY_DSN`: the error stays in the log line only.
 *
 *  Example: `buildApp({ env, db, errorReportSink: new DiscardedErrorReportSink() })` */
export class DiscardedErrorReportSink implements ErrorReportSink {
  capture(): void {}

  flush(): Promise<boolean> {
    return Promise.resolve(true);
  }
}
