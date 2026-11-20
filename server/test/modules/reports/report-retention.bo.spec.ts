import { describe, expect, it } from 'vitest';
import { ReportRetentionBo } from '../../../src/modules/reports/report-retention.bo';

describe('ReportRetentionBo', () => {
  it('a closed report is kept 6 calendar months: the cut on 19/11 is 19/05', () => {
    const now = new Date('2026-11-19T15:00:00.000Z');

    expect(ReportRetentionBo.closedReportsCutOf(now)).toEqual(new Date('2026-05-19T15:00:00.000Z'));
  });

  it('6 months before 31/08 falls on the last day of February, never in March', () => {
    const now = new Date('2026-08-31T10:00:00.000Z');

    expect(ReportRetentionBo.closedReportsCutOf(now)).toEqual(new Date('2026-02-28T10:00:00.000Z'));
  });

  it('a loose screenshot is kept one day: the cut is 24 h before', () => {
    const now = new Date('2026-11-19T15:00:00.000Z');

    expect(ReportRetentionBo.looseAttachmentsCutOf(now)).toEqual(
      new Date('2026-11-18T15:00:00.000Z'),
    );
  });
});
