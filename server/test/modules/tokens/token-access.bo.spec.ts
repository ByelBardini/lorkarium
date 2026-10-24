import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import { TokenAccessBo } from '../../../src/modules/tokens/token-access.bo';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, DUDA_ID, VHARN_ID } from '../../support/campaigns-factories';
import { LYRA_ID } from '../../support/tokens-factories';

function accessOf(
  userId: string,
  role: 'master' | 'player' | 'spectator',
  controllerIds: readonly string[] = [BIA_ID],
): TokenAccessBo {
  const campaign = new CampaignAccessBo({ campaignId: VHARN_ID, userId, role });
  return new TokenAccessBo(campaign, { tokenId: LYRA_ID, controllerIds });
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

  describe('requireMove', () => {
    it('Bia moves her token on the tokens layer', () => {
      expect(() => accessOf(BIA_ID, 'player').requireMove('move', 'tokens')).not.toThrow();
    });

    it('Bia moving her token on the objects layer is FORBIDDEN citing her, the move, the token and the layer', () => {
      expect(() => accessOf(BIA_ID, 'player').requireMove('drag', 'objects')).toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
          message: expect.stringMatching(
            new RegExp(`${BIA_ID}.*drag token ${LYRA_ID} on the objects layer`),
          ),
        }),
      );
    });

    it('the master moves a token on the background layer', () => {
      expect(() => accessOf(ANA_ID, 'master').requireMove('move', 'background')).not.toThrow();
    });

    it('Caio moving Bia’s token on the tokens layer is still FORBIDDEN', () => {
      expect(() => accessOf(CAIO_ID, 'player').requireMove('move', 'tokens')).toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );
    });
  });

  describe('requireListed', () => {
    it('Bia, listed as a controller of Lyra, may choose her as main token', () => {
      expect(() => accessOf(BIA_ID, 'player').requireListed('choose as main')).not.toThrow();
    });

    it('Ana, master and listed as a controller, may choose Lyra as main token', () => {
      const listed = accessOf(ANA_ID, 'master', [BIA_ID, ANA_ID]);
      expect(() => listed.requireListed('choose as main')).not.toThrow();
    });

    it('Ana, master but not listed, is FORBIDDEN citing her, the action and the token', () => {
      expect(() => accessOf(ANA_ID, 'master').requireListed('choose as main')).toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
          message: expect.stringMatching(new RegExp(`${ANA_ID}.*choose as main token ${LYRA_ID}`)),
        }),
      );
    });

    it('Caio, a player not listed, is FORBIDDEN citing him', () => {
      expect(() => accessOf(CAIO_ID, 'player').requireListed('choose as main')).toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
          message: expect.stringContaining(CAIO_ID),
        }),
      );
    });
  });

  describe('requireChooseMainFor', () => {
    it('Bia choosing for herself takes being listed, as requireListed', () => {
      expect(() => accessOf(BIA_ID, 'player').requireChooseMainFor(BIA_ID)).not.toThrow();
      expect(() => accessOf(CAIO_ID, 'player').requireChooseMainFor(CAIO_ID)).toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );
    });

    it('Ana, master and not listed, may choose Lyra as the main token of Bia, who is', () => {
      expect(() => accessOf(ANA_ID, 'master').requireChooseMainFor(BIA_ID)).not.toThrow();
    });

    it('Ana choosing Lyra for Caio, who is not listed, is FORBIDDEN citing him and the token', () => {
      expect(() => accessOf(ANA_ID, 'master').requireChooseMainFor(CAIO_ID)).toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
          message: expect.stringMatching(new RegExp(`token ${LYRA_ID} as main of ${CAIO_ID}`)),
        }),
      );
    });

    it('Caio, a player, choosing for Bia is FORBIDDEN even though she is listed', () => {
      const shared = accessOf(CAIO_ID, 'player', [BIA_ID, CAIO_ID]);
      expect(() => shared.requireChooseMainFor(BIA_ID)).toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
          message: expect.stringContaining(`choose the main token of ${BIA_ID}`),
        }),
      );
    });
  });

  describe('the control of a spectator is inert', () => {
    const kael = [DUDA_ID, CAIO_ID];

    it('Duda, a spectator listed in the control of Kael, gets the redacted token', () => {
      expect(accessOf(DUDA_ID, 'spectator', kael).audience()).toBe('others');
    });

    it('Duda moving Kael is refused with FORBIDDEN citing her and the token', () => {
      expect(() => accessOf(DUDA_ID, 'spectator', kael).requireControl('move')).toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
          message: expect.stringMatching(new RegExp(`${DUDA_ID}.*move token ${LYRA_ID}`)),
        }),
      );
    });

    it('Duda listed in the control may not choose Kael as her main token', () => {
      expect(() => accessOf(DUDA_ID, 'spectator', kael).requireListed('choose as main')).toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );
    });

    it('Caio, a player listed beside her, still gets the whole token', () => {
      expect(accessOf(CAIO_ID, 'player', kael).audience()).toBe('privileged');
    });

    it('the master still gets the whole token', () => {
      expect(accessOf(ANA_ID, 'master', kael).audience()).toBe('privileged');
    });
  });
});
