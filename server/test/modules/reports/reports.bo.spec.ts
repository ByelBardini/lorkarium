import { describe, expect, it } from 'vitest';
import { UserReportBo } from '../../../src/modules/reports/reports.bo';
import { BIA_ID, CAIO_ID } from '../../support/campaigns-factories';

describe('UserReportBo', () => {
  it('reporting oneself is REPORT_SELF citing the id', () => {
    expect(() => UserReportBo.requireNotSelf(BIA_ID, BIA_ID)).toThrow(
      expect.objectContaining({ code: 'REPORT_SELF', message: expect.stringContaining(BIA_ID) }),
    );
  });

  it('reporting someone else passes', () => {
    expect(UserReportBo.requireNotSelf(BIA_ID, CAIO_ID)).toBeUndefined();
  });

  it('a pair that already has an open report is REPORT_ALREADY_OPEN citing both ids', () => {
    expect(() => UserReportBo.requireInserted(false, BIA_ID, CAIO_ID)).toThrow(
      expect.objectContaining({
        code: 'REPORT_ALREADY_OPEN',
        message: expect.stringMatching(new RegExp(`${BIA_ID}.*${CAIO_ID}`)),
      }),
    );
  });

  it('a user does not resolve a report', () => {
    expect(() => UserReportBo.requireResolver('user')).toThrow(
      expect.objectContaining({ code: 'REPORT_FORBIDDEN' }),
    );
  });

  it('an admin resolves', () => {
    expect(UserReportBo.requireResolver('admin')).toBeUndefined();
  });
});
