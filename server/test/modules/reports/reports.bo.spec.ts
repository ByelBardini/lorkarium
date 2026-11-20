import { describe, expect, it } from 'vitest';
import { UserReportBo } from '../../../src/modules/reports/reports.bo';
import { BIA_ID, CAIO_ID } from '../../support/campaigns-factories';

const VHARN_ID = '00000000-0000-4000-8000-0000000000a1';
const SHOT_A = '00000000-0000-4000-8000-0000000000b1';
const SHOT_B = '00000000-0000-4000-8000-0000000000b2';

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
    expect(() => UserReportBo.requireInserted(undefined, BIA_ID, CAIO_ID)).toThrow(
      expect.objectContaining({
        code: 'REPORT_ALREADY_OPEN',
        message: expect.stringMatching(new RegExp(`${BIA_ID}.*${CAIO_ID}`)),
      }),
    );
  });

  it('an inserted report gives its id back', () => {
    expect(UserReportBo.requireInserted(SHOT_A, BIA_ID, CAIO_ID)).toBe(SHOT_A);
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

describe('UserReportBo, who is reported', () => {
  it('an active account is reported with its @ and name of now', () => {
    const caio = { username: 'caio', name: 'Caio', suspended: false };

    expect(UserReportBo.requireActiveTarget(caio, CAIO_ID)).toEqual(caio);
  });

  it.each([
    ['unknown', undefined],
    ['suspended', { username: 'caio', name: 'Caio', suspended: true }],
  ])('an %s account is REPORT_TARGET_NOT_FOUND citing the id', (_label, account) => {
    expect(() => UserReportBo.requireActiveTarget(account, CAIO_ID)).toThrow(
      expect.objectContaining({
        code: 'REPORT_TARGET_NOT_FOUND',
        message: expect.stringContaining(CAIO_ID),
      }),
    );
  });
});

describe('UserReportBo, the table where it happened', () => {
  it('a table both accounts sit at gives its name to keep', () => {
    expect(UserReportBo.requireSharedCampaign(VHARN_ID, 'Os Sinos de Vharn')).toBe(
      'Os Sinos de Vharn',
    );
  });

  it('a table one of the two is not at is CAMPAIGN_NOT_SHARED citing the table', () => {
    expect(() => UserReportBo.requireSharedCampaign(VHARN_ID, undefined)).toThrow(
      expect.objectContaining({
        code: 'CAMPAIGN_NOT_SHARED',
        message: expect.stringContaining(VHARN_ID),
      }),
    );
  });
});

describe('UserReportBo, the screenshots it claims', () => {
  it('screenshots the reporter sent and no report claimed yet pass', () => {
    expect(UserReportBo.requireClaimable([SHOT_A, SHOT_B], [SHOT_B, SHOT_A])).toBeUndefined();
  });

  it('no screenshot at all passes', () => {
    expect(UserReportBo.requireClaimable([], [])).toBeUndefined();
  });

  it("someone else's or an already claimed screenshot is ATTACHMENT_NOT_FOUND citing it", () => {
    expect(() => UserReportBo.requireClaimable([SHOT_A, SHOT_B], [SHOT_A])).toThrow(
      expect.objectContaining({
        code: 'ATTACHMENT_NOT_FOUND',
        message: expect.stringContaining(SHOT_B),
      }),
    );
  });
});
