import { describe, expect, it } from 'vitest';
import { memberAccessOf } from '../../../src/modules/campaigns/member-access';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import { BIA_ID, CAIO_ID, VHARN_ID, campaignMemberPo } from '../../support/campaigns-factories';

const members = new CampaignMembersDaoFake(
  new CampaignsDaoFake(),
  { [ANA_ID]: 'Ana', [BIA_ID]: 'Bia' },
  [
    campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
    campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
  ],
);

describe('memberAccessOf', () => {
  it('the master of the table gets an access that knows she is the master', async () => {
    expect((await memberAccessOf(members, VHARN_ID, ANA_ID)).isMaster()).toBe(true);
  });

  it('a player of the table gets an access that knows she is not', async () => {
    expect((await memberAccessOf(members, VHARN_ID, BIA_ID)).isMaster()).toBe(false);
  });

  it('someone outside the table is refused with CAMPAIGN_NOT_FOUND', async () => {
    await expect(memberAccessOf(members, VHARN_ID, CAIO_ID)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_FOUND',
    });
  });
});
