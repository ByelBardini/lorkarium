import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import { TokenAccessBo } from '../../../src/modules/tokens/token-access.bo';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';
import { LYRA_ID } from '../../support/tokens-factories';

function accessOf(userId: string, role: 'master' | 'player'): TokenAccessBo {
  const campaign = new CampaignAccessBo({ campaignId: VHARN_ID, userId, role });
  return new TokenAccessBo(campaign, { tokenId: LYRA_ID, controllerIds: [BIA_ID] });
}

describe('TokenAccessBo', () => {
  it('the master controls every token', () => {
    expect(accessOf(ANA_ID, 'master').canControl()).toBe(true);
  });

  it('Bia controls the token she is a controller of', () => {
    expect(accessOf(BIA_ID, 'player').canControl()).toBe(true);
    expect(() => accessOf(BIA_ID, 'player').requireControl('move')).not.toThrow();
  });

  it('Caio moving Bia’s token is refused with FORBIDDEN citing him and the token', () => {
    expect(accessOf(CAIO_ID, 'player').canControl()).toBe(false);
    expect(() => accessOf(CAIO_ID, 'player').requireControl('move')).toThrow(
      expect.objectContaining({
        code: 'FORBIDDEN',
        message: expect.stringMatching(new RegExp(`${CAIO_ID}.*move token ${LYRA_ID}`)),
      }),
    );
  });

  it('privileged is the master or a controller; anyone else gets the redacted token', () => {
    expect(accessOf(ANA_ID, 'master').audience()).toBe('privileged');
    expect(accessOf(BIA_ID, 'player').audience()).toBe('privileged');
    expect(accessOf(CAIO_ID, 'player').audience()).toBe('others');
  });
});
