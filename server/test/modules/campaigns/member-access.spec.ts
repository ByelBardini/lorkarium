import { describe, expect, it } from 'vitest';
import { memberAccessOf, viewerAccessOf } from '../../../src/modules/campaigns/member-access';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import {
  BIA_ID,
  CAIO_ID,
  DUDA_ID,
  VHARN_ID,
  campaignMemberPo,
} from '../../support/campaigns-factories';

const members = new CampaignMembersDaoFake(
  new CampaignsDaoFake(),
  { [ANA_ID]: 'Ana', [BIA_ID]: 'Bia', [DUDA_ID]: 'Duda' },
  [
    campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
    campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
    campaignMemberPo({ campaignId: VHARN_ID, userId: DUDA_ID, role: 'spectator' }),
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

  it('Duda, a spectator, is refused with FORBIDDEN when she would act', async () => {
    await expect(memberAccessOf(members, VHARN_ID, DUDA_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('viewerAccessOf', () => {
  it('Duda, a spectator, gets an access that knows she only watches', async () => {
    expect((await viewerAccessOf(members, VHARN_ID, DUDA_ID)).isSpectator()).toBe(true);
  });

  it('Bia, a player, gets an access that knows she is not a spectator', async () => {
    expect((await viewerAccessOf(members, VHARN_ID, BIA_ID)).isSpectator()).toBe(false);
  });

  it('someone outside the table is refused with CAMPAIGN_NOT_FOUND', async () => {
    await expect(viewerAccessOf(members, VHARN_ID, CAIO_ID)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_FOUND',
    });
  });
});
