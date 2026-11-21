import { describe, expect, it } from 'vitest';
import { ErrorReportThrottleBo } from '../../../src/modules/error-reports/error-report-throttle.bo';
import { UnexpectedErrorsService } from '../../../src/modules/error-reports/unexpected-errors.service';
import { ClockFake } from '../../support/auth-fakes';
import { ErrorReportSinkFake, ReportFailureLogFake } from '../../support/error-reports-fakes';

const MINUTE = 60_000;
const REQUEST = { reqId: 'req-1', route: '/api/campaigns/:campaignId', method: 'PATCH' };

function serviceWith(sink: ErrorReportSinkFake) {
  const clock = new ClockFake(new Date('2026-11-20T12:00:00.000Z'));
  const throttle = new ErrorReportThrottleBo({ windowMs: MINUTE });
  const log = new ReportFailureLogFake();
  return { service: new UnexpectedErrorsService({ sink, clock, throttle }), clock, log };
}

describe('UnexpectedErrorsService.onErrorLog', () => {
  it('an error log reaches the sink with its message, context and fingerprint', () => {
    const sink = new ErrorReportSinkFake();
    const { service, log } = serviceWith(sink);
    const err = new Error('boom');
    service.onErrorLog([{ err }, 'unexpected error in the campaigns module'], REQUEST, log);
    expect(sink.reports).toHaveLength(1);
    expect(sink.reports[0]).toMatchObject({
      error: err,
      message: 'unexpected error in the campaigns module',
      context: REQUEST,
      suppressed: 0,
    });
    expect(sink.reports[0]?.fingerprint).toContain('unexpected error in the campaigns module');
  });

  it('the same error twice in a minute is sent once; the next one counts the silenced', () => {
    const sink = new ErrorReportSinkFake();
    const { service, clock, log } = serviceWith(sink);
    const args = [{ err: new Error('boom') }, 'unexpected error in the auth module'];
    service.onErrorLog(args, {}, log);
    service.onErrorLog(args, {}, log);
    clock.current = new Date(clock.current.getTime() + MINUTE);
    service.onErrorLog(args, {}, log);
    expect(sink.reports.map((report) => report.suppressed)).toEqual([0, 1]);
  });

  it('a sink that throws is swallowed into one warn, never retried', () => {
    const sink = new ErrorReportSinkFake().failing();
    const { service, log } = serviceWith(sink);
    expect(() => service.onErrorLog([new Error('boom')], {}, log)).not.toThrow();
    expect(log.warnings).toEqual([
      {
        fields: { err: new Error('sentry down') },
        message: 'error report not sent: the error report sink failed',
      },
    ]);
    expect(sink.reports).toHaveLength(0);
  });
});
