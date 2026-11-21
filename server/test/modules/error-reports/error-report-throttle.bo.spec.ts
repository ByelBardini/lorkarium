import { describe, expect, it } from 'vitest';
import { ErrorReportThrottleBo } from '../../../src/modules/error-reports/error-report-throttle.bo';

const MINUTE = 60_000;
const T = Date.parse('2026-11-20T12:00:00.000Z');

describe('ErrorReportThrottleBo.admits', () => {
  it('lets one report per fingerprint through each window and counts the silenced ones', () => {
    const throttle = new ErrorReportThrottleBo({ windowMs: MINUTE });
    expect(throttle.admits('f1', T)).toEqual({ admitted: true, suppressed: 0 });
    expect(throttle.admits('f1', T + 59_000)).toEqual({ admitted: false });
    expect(throttle.admits('f1', T + MINUTE)).toEqual({ admitted: true, suppressed: 1 });
  });

  it('another fingerprint is not held by the first one', () => {
    const throttle = new ErrorReportThrottleBo({ windowMs: MINUTE });
    throttle.admits('f1', T);
    expect(throttle.admits('f2', T + 1000)).toEqual({ admitted: true, suppressed: 0 });
  });

  it('forgets the oldest fingerprint past the ceiling and never grows beyond it', () => {
    const throttle = new ErrorReportThrottleBo({ windowMs: MINUTE, maxFingerprints: 500 });
    for (let index = 0; index <= 500; index += 1) throttle.admits(`f${index}`, T);
    expect(throttle.size).toBe(500);
    expect(throttle.admits('f0', T + 1)).toEqual({ admitted: true, suppressed: 0 });
    expect(throttle.admits('f500', T + 1)).toEqual({ admitted: false });
  });

  it.each([0, -1])('refuses a window of %i ms citing the value', (windowMs) => {
    expect(() => new ErrorReportThrottleBo({ windowMs })).toThrow(
      `windowMs must be a positive number of milliseconds (received ${windowMs})`,
    );
  });
});
