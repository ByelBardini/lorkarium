import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import { MemberCardBo } from '../../../src/modules/member-cards/member-card.bo';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';

const STRANGER_ID = 'f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b';

function cardOf(userId: string, role: 'master' | 'player', memberId: string, isMember = true) {
  const access = new CampaignAccessBo({ campaignId: VHARN_ID, userId, role });
  return new MemberCardBo(access, { memberId, isMember });
}

describe('MemberCardBo.requireEdit', () => {
  it('Bia edits her own card', () => {
    expect(() => cardOf(BIA_ID, 'player', BIA_ID).requireEdit()).not.toThrow();
  });

  it('Ana, the master, edits the card of Bia', () => {
    expect(() => cardOf(ANA_ID, 'master', BIA_ID).requireEdit()).not.toThrow();
  });

  it('Ana, the master, edits her own card', () => {
    expect(() => cardOf(ANA_ID, 'master', ANA_ID).requireEdit()).not.toThrow();
  });

  it('Caio, a player, editing the card of Bia is FORBIDDEN citing him and the card', () => {
    expect(() => cardOf(CAIO_ID, 'player', BIA_ID).requireEdit()).toThrow(
      expect.objectContaining({
        code: 'FORBIDDEN',
        message: expect.stringMatching(new RegExp(`${CAIO_ID}.*edit the card of ${BIA_ID}`)),
      }),
    );
  });

  it('a memberId that is not a member of the table is MEMBER_NOT_FOUND citing the id and the table', () => {
    expect(() => cardOf(ANA_ID, 'master', STRANGER_ID, false).requireEdit()).toThrow(
      expect.objectContaining({
        code: 'MEMBER_NOT_FOUND',
        message: expect.stringMatching(new RegExp(`${VHARN_ID}.*${STRANGER_ID}`)),
      }),
    );
  });
});
