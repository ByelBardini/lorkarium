import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import { AuthoredAccessBo } from '../../../src/modules/scenes/authored-access.bo';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';
import { SQUARE_ID } from '../../support/drawings-factories';

function accessOf(userId: string, role: 'master' | 'player', noun = 'drawing'): AuthoredAccessBo {
  return new AuthoredAccessBo(new CampaignAccessBo({ campaignId: VHARN_ID, userId, role }), noun);
}

const BIAS_SQUARE = { id: SQUARE_ID, authorId: BIA_ID } as const;

describe('AuthoredAccessBo.requireEdit', () => {
  it('Bia moves her own piece', () => {
    expect(() => accessOf(BIA_ID, 'player').requireEdit('move', BIAS_SQUARE)).not.toThrow();
  });

  it('the master deletes a piece of Bia', () => {
    expect(() => accessOf(ANA_ID, 'master').requireEdit('delete', BIAS_SQUARE)).not.toThrow();
  });

  it('the master edits a piece whose author is gone', () => {
    const orphan = { ...BIAS_SQUARE, authorId: null };
    expect(() => accessOf(ANA_ID, 'master').requireEdit('move', orphan)).not.toThrow();
  });

  it.each([
    ['drawing', `move drawing ${SQUARE_ID}`],
    ['effect area', `move effect area ${SQUARE_ID}`],
  ])('Caio moving the %s of Bia is refused with FORBIDDEN naming the piece', (noun, cited) => {
    expect(() => accessOf(CAIO_ID, 'player', noun).requireEdit('move', BIAS_SQUARE)).toThrow(
      expect.objectContaining({
        code: 'FORBIDDEN',
        message: expect.stringMatching(new RegExp(`${CAIO_ID}.*${cited}`)),
      }),
    );
  });

  it('a player cannot edit a piece with no author left', () => {
    const orphan = { ...BIAS_SQUARE, authorId: null };
    expect(() => accessOf(BIA_ID, 'player').requireEdit('move', orphan)).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });
});
