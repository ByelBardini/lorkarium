import { PLAN_LIMITS } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { lockedSheetOf, lockedTableOf } from '../../../src/modules/sheets/sheet-write-locks';
import { ANA_ID } from '../../support/auth-factories';
import { LYRA_SHEET_ID, SheetsHarness } from '../../support/sheets-fakes';

describe('sheet write locks', () => {
  it("the table lock locks the table and gives the owner's effective limits", async () => {
    const harness = new SheetsHarness();
    harness.campaigns.owner = { role: 'user', plan: 'free', lorkariumOwner: false };

    const locked = await lockedTableOf(harness.members, harness.daos, harness.as(ANA_ID));

    expect(locked.limits).toEqual(PLAN_LIMITS.free);
    expect(locked.access.campaignIdOf()).toBe(harness.as(ANA_ID).campaignId);
    expect(harness.journal).toEqual(['lock']);
  });

  it('the table lock gives an admin owner the limits of the amigo_do_dono', async () => {
    const harness = new SheetsHarness();
    harness.campaigns.owner = { role: 'admin', plan: 'free', lorkariumOwner: false };

    const { limits } = await lockedTableOf(harness.members, harness.daos, harness.as(ANA_ID));

    expect(limits).toEqual(PLAN_LIMITS.amigo_do_dono);
  });

  it('a table gone before the lock is CAMPAIGN_NOT_FOUND', async () => {
    const harness = new SheetsHarness();
    harness.campaigns.rows.length = 0;

    await expect(
      lockedTableOf(harness.members, harness.daos, harness.as(ANA_ID)),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_FOUND' });
  });

  it('the sheet lock locks only that sheet, never the table', async () => {
    const harness = new SheetsHarness();

    const locked = await lockedSheetOf(
      harness.members,
      harness.daos,
      harness.as(ANA_ID),
      LYRA_SHEET_ID,
    );

    expect(locked.access.campaignIdOf()).toBe(harness.as(ANA_ID).campaignId);
    expect(harness.journal).toEqual(['lock sheet']);
  });
});
