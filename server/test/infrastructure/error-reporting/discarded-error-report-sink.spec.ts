import { describe, expect, it } from 'vitest';
import { DiscardedErrorReportSink } from '../../../src/infrastructure/error-reporting/discarded-error-report-sink';
import type { ErrorReportSink } from '../../../src/modules/error-reports/error-report-sink.port';

describe('DiscardedErrorReportSink', () => {
  it('takes a report without throwing and flushes as drained', async () => {
    const sink: ErrorReportSink = new DiscardedErrorReportSink();
    const report = {
      error: new Error('boom'),
      message: 'boom',
      fields: {},
      context: {},
      user: null,
      fingerprint: 'f',
      suppressed: 0,
    };
    expect(sink.capture(report)).toBeUndefined();
    expect(await sink.flush(10)).toBe(true);
  });
});
