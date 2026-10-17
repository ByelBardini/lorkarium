import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import { DrawingAccessBo } from '../../../src/modules/drawings/drawing-access.bo';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';
import { SQUARE_ID } from '../../support/drawings-factories';

function accessOf(userId: string, role: 'master' | 'player'): DrawingAccessBo {
  return new DrawingAccessBo(new CampaignAccessBo({ campaignId: VHARN_ID, userId, role }));
}

const BIAS_SQUARE = { drawingId: SQUARE_ID, authorId: BIA_ID, layer: 'tokens' } as const;

describe('DrawingAccessBo.requireLayer', () => {
  it('a player draws on the tokens layer', () => {
    expect(() => accessOf(BIA_ID, 'player').requireLayer('draw', 'tokens')).not.toThrow();
  });

  it('the master draws on the background layer', () => {
    expect(() => accessOf(ANA_ID, 'master').requireLayer('draw', 'background')).not.toThrow();
  });

  it('a player drawing on the objects layer is refused with FORBIDDEN citing her, the action and the layer', () => {
    expect(() => accessOf(BIA_ID, 'player').requireLayer('draw', 'objects')).toThrow(
      expect.objectContaining({
        code: 'FORBIDDEN',
        message: expect.stringMatching(new RegExp(`${BIA_ID}.*draw on the objects layer`)),
      }),
    );
  });
});

describe('DrawingAccessBo.requireEdit', () => {
  it('Bia moves her own drawing on the tokens layer', () => {
    expect(() => accessOf(BIA_ID, 'player').requireEdit('move', BIAS_SQUARE)).not.toThrow();
  });

  it('the master deletes a drawing of Bia', () => {
    expect(() => accessOf(ANA_ID, 'master').requireEdit('delete', BIAS_SQUARE)).not.toThrow();
  });

  it('the master edits a drawing whose author is gone', () => {
    const orphan = { ...BIAS_SQUARE, authorId: null };
    expect(() => accessOf(ANA_ID, 'master').requireEdit('move', orphan)).not.toThrow();
  });

  it('Caio moving the drawing of Bia is refused with FORBIDDEN citing the drawing', () => {
    expect(() => accessOf(CAIO_ID, 'player').requireEdit('move', BIAS_SQUARE)).toThrow(
      expect.objectContaining({
        code: 'FORBIDDEN',
        message: expect.stringMatching(new RegExp(`${CAIO_ID}.*move drawing ${SQUARE_ID}`)),
      }),
    );
  });

  it('a player cannot edit a drawing with no author left', () => {
    const orphan = { ...BIAS_SQUARE, authorId: null };
    expect(() => accessOf(BIA_ID, 'player').requireEdit('move', orphan)).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('Bia moving her own drawing that the master put on the objects layer is refused citing the layer', () => {
    const onObjects = { ...BIAS_SQUARE, layer: 'objects' } as const;
    expect(() => accessOf(BIA_ID, 'player').requireEdit('move', onObjects)).toThrow(
      expect.objectContaining({
        code: 'FORBIDDEN',
        message: expect.stringContaining(`move drawing ${SQUARE_ID} on the objects layer`),
      }),
    );
  });
});
