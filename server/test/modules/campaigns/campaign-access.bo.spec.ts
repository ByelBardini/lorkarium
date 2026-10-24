import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, DUDA_ID, VHARN_ID } from '../../support/campaigns-factories';

type RoleOrNone = 'master' | 'player' | 'spectator' | null;

function accessOf(role: RoleOrNone, userId: string = ANA_ID): CampaignAccessBo {
  return new CampaignAccessBo({ campaignId: VHARN_ID, userId, role });
}

const duda = (): CampaignAccessBo => accessOf('spectator', DUDA_ID);
const bia = (): CampaignAccessBo => accessOf('player', BIA_ID);

describe('CampaignAccessBo', () => {
  it('the master passes requireMember and can see the join code', () => {
    const access = accessOf('master');
    expect(() => access.requireMember()).not.toThrow();
    expect(access.canSeeJoinCode()).toBe(true);
  });

  it('a player passes requireMember but cannot see the join code', () => {
    const access = accessOf('player');
    expect(() => access.requireMember()).not.toThrow();
    expect(access.canSeeJoinCode()).toBe(false);
  });

  it('someone without membership is refused with CAMPAIGN_NOT_FOUND citing campaign and user', () => {
    expect(() => accessOf(null).requireMember()).toThrow(
      expect.objectContaining({
        code: 'CAMPAIGN_NOT_FOUND',
        message: expect.stringMatching(new RegExp(`${VHARN_ID}.*${ANA_ID}`)),
      }),
    );
  });

  it('someone without membership cannot see the join code', () => {
    expect(accessOf(null).canSeeJoinCode()).toBe(false);
  });

  it('requireMaster lets the master through', () => {
    expect(() => accessOf('master').requireMaster('configure the grid')).not.toThrow();
  });

  it('requireMaster refuses a player with FORBIDDEN citing user, action and campaign', () => {
    expect(() => accessOf('player').requireMaster('configure the grid')).toThrow(
      expect.objectContaining({
        code: 'FORBIDDEN',
        message: expect.stringMatching(new RegExp(`${ANA_ID}.*configure the grid.*${VHARN_ID}`)),
      }),
    );
  });

  it('requireMaster refuses someone without membership with CAMPAIGN_NOT_FOUND, not FORBIDDEN', () => {
    expect(() => accessOf(null).requireMaster('configure the grid')).toThrow(
      expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND' }),
    );
  });

  it('isMaster is true only for the master', () => {
    expect(accessOf('master').isMaster()).toBe(true);
    expect(accessOf('player').isMaster()).toBe(false);
  });

  it('isUser compares with the member the access was built for', () => {
    expect(accessOf('player').isUser(ANA_ID)).toBe(true);
    expect(accessOf('player').isUser(VHARN_ID)).toBe(false);
  });

  it('campaignIdOf names the table', () => {
    expect(accessOf('player').campaignIdOf()).toBe(VHARN_ID);
  });

  it('userIdOf names who asked', () => {
    expect(accessOf('player').userIdOf()).toBe(ANA_ID);
  });

  describe('the spectator sees the table and is refused every action', () => {
    it('requireViewer gives Duda, a spectator, the spectator role', () => {
      expect(duda().requireViewer()).toBe('spectator');
    });

    it('requireViewer gives Bia, a player, the player role', () => {
      expect(bia().requireViewer()).toBe('player');
    });

    it('requireMember still gives Bia, a player, the player role', () => {
      expect(bia().requireMember()).toBe('player');
    });

    it('requireMember refuses Duda with FORBIDDEN citing her, the table and the player or master role', () => {
      expect(() => duda().requireMember()).toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
          message: expect.stringMatching(
            new RegExp(`${DUDA_ID}.*${VHARN_ID}.*the player or master role`),
          ),
        }),
      );
    });

    it('requireMaster refuses Duda with FORBIDDEN, not CAMPAIGN_NOT_FOUND', () => {
      expect(() => duda().requireMaster('configure the grid')).toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );
    });

    it('requireViewer refuses someone without membership with CAMPAIGN_NOT_FOUND', () => {
      expect(() => accessOf(null, DUDA_ID).requireViewer()).toThrow(
        expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND' }),
      );
    });

    it('isMaster is false for Duda without throwing', () => {
      expect(duda().isMaster()).toBe(false);
    });

    it('isSpectator is true only for the spectator', () => {
      expect(duda().isSpectator()).toBe(true);
      expect(bia().isSpectator()).toBe(false);
      expect(accessOf('master').isSpectator()).toBe(false);
    });

    it('Duda cannot see the join code', () => {
      expect(duda().canSeeJoinCode()).toBe(false);
    });
  });
});
